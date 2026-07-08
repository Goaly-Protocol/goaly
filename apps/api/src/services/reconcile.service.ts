import { ARBITRUM, type Outcome, resolveOutcome } from '@goaly/core';
import {
  createArbitrumClient,
  type MarketStatus,
  marketIdFor,
  readMarketStatus,
} from '@goaly/plugin-onchain';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Hex, PublicClient } from 'viem';
import type { DB } from '../db/client';
import { matches, predictions } from '../db/schema';
import type { Env } from '../env';
import type { PredictionService } from './prediction.service';

export interface ReconcileSummary {
  /** Markets found OPEN on-chain that we re-settled (settle retried). */
  onchainSettled: number;
  /** Matches whose off-chain pot we settled because predictions were still unsettled. */
  offchainSettled: number;
  /** Markets already SETTLED / NONE on-chain → nothing to retry. */
  skipped: number;
  /**
   * Scoreless FINISHED matches we resolved from the closing-odds favorite because the feed never
   * delivered a final score and the fallback deadline (SETTLE_FALLBACK_HOURS after kickoff) passed.
   * Each one gets a synthetic score persisted, then settles through the same path as a real score.
   */
  estimated: number;
  /** Per-market failures (logged, never thrown — one bad market can't stop the loop). */
  errors: number;
}

export interface ReconcileDeps {
  db: DB;
  env: Env;
  /** Off-chain settlement (pot payouts). Only its `settleMatch` is used. */
  predictionService: Pick<PredictionService, 'settleMatch'>;
  /**
   * Retry the on-chain market settle. Present when an oracle key is configured (ORACLE_PK);
   * when absent the reconcile job only heals the off-chain ledger.
   */
  settleOnchain?: (matchId: string, result: Outcome) => Promise<void>;
  /**
   * Read a market's on-chain status. Injectable in tests to avoid real RPC calls; defaults to a
   * live read against `ARBITRUM.goaly.markets` via `createArbitrumClient(env.ARBITRUM_RPC_URL)`.
   */
  readMarketStatus?: (marketId: Hex) => Promise<MarketStatus>;
  /** Wall-clock source (ms). Injectable so the fallback deadline is deterministic in tests. */
  now?: () => number;
}

/** The closing-odds columns the fallback estimator reads (all nullable until frozen at kickoff). */
export interface ClosingBps {
  closingHomeBps: number | null;
  closingDrawBps: number | null;
  closingAwayBps: number | null;
}

/**
 * Best-guess final score for a scoreless-but-finished match, from its frozen closing odds.
 *
 * The favorite is the outcome with the LOWEST non-null closing bps (bps = decimal-odds × 10_000, so
 * shortest odds = most likely). It maps to a minimal representative score that `resolveOutcome`
 * grades back to the intended outcome and that drives the off-chain payout correctly:
 *   HOME favorite → 1-0, AWAY favorite → 0-1, DRAW favorite (or all odds null) → 0-0.
 *
 * Pure + deterministic; on a tie the earliest of HOME→DRAW→AWAY wins.
 */
export function estimateScoreFromOdds(match: ClosingBps): { homeScore: number; awayScore: number } {
  const candidates: { outcome: Outcome; bps: number }[] = [];
  if (match.closingHomeBps !== null)
    candidates.push({ outcome: 'HOME', bps: match.closingHomeBps });
  if (match.closingDrawBps !== null)
    candidates.push({ outcome: 'DRAW', bps: match.closingDrawBps });
  if (match.closingAwayBps !== null)
    candidates.push({ outcome: 'AWAY', bps: match.closingAwayBps });

  let favorite: { outcome: Outcome; bps: number } | null = null;
  for (const candidate of candidates) {
    if (favorite === null || candidate.bps < favorite.bps) favorite = candidate;
  }

  // All odds null → no favorite → DRAW (0-0). Otherwise map the shortest-odds outcome to 1-0/0-1/0-0.
  if (favorite === null || favorite.outcome === 'DRAW') return { homeScore: 0, awayScore: 0 };
  return favorite.outcome === 'HOME'
    ? { homeScore: 1, awayScore: 0 }
    : { homeScore: 0, awayScore: 1 };
}

export interface Reconciler {
  reconcile(): Promise<ReconcileSummary>;
}

/**
 * Settlement reconcile job — the retry safety net for settlement.
 *
 * `SyncService.settleOnchainSafe()` settles a market exactly once when a match transitions to
 * FINISHED, and swallows failures (e.g. the oracle was out of gas). That single shot is why a
 * failure leaks silently. This reconciler re-scans finished matches on a background loop and:
 *   - re-settles any market still OPEN on-chain (settle retried), and
 *   - settles the off-chain pot for any match whose predictions aren't settled yet.
 *
 * It is safe + additive: it never changes the happy-path settle behaviour, only heals misses. A
 * failure on one market is counted + logged and never thrown, so a single bad market can't stall
 * the loop or the other matches behind it.
 */
export function createReconciler(deps: ReconcileDeps): Reconciler {
  const { db, env, predictionService, settleOnchain } = deps;
  const now = deps.now ?? Date.now;
  const markets = ARBITRUM.goaly.markets as `0x${string}`;

  // Lazily create the RPC client only if we ever fall back to a live read (never in tests).
  let client: PublicClient | null = null;
  const readStatus =
    deps.readMarketStatus ??
    ((marketId: Hex): Promise<MarketStatus> => {
      client ??= createArbitrumClient(env.ARBITRUM_RPC_URL);
      return readMarketStatus(client, { markets, marketId });
    });

  async function reconcile(): Promise<ReconcileSummary> {
    const summary: ReconcileSummary = {
      onchainSettled: 0,
      offchainSettled: 0,
      skipped: 0,
      estimated: 0,
      errors: 0,
    };

    // Only matches that carry stakes (predictions) can have stuck *funds*. Restricting to those keeps
    // each pass to a handful of on-chain reads — the full FINISHED set can be hundreds (the whole
    // feed can share a recent kickoff), which would make the pass and the manual /admin/reconcile
    // time out. No-stake markets that never settled have no funds at risk; the dashboard flags them.
    const betMatchIds = db
      .selectDistinct({ matchId: predictions.matchId })
      .from(predictions)
      .all()
      .map((r) => r.matchId);

    if (betMatchIds.length === 0) {
      console.log(
        '[reconcile] onchain=0 offchain=0 skipped=0 estimated=0 errors=0 (no staked matches)',
      );
      return summary;
    }

    const finished = db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.status, 'FINISHED'),
          isNotNull(matches.homeScore),
          isNotNull(matches.awayScore),
          inArray(matches.id, betMatchIds),
        ),
      )
      .all();

    // ── Deadline fallback: scoreless-but-FINISHED matches (the complement of `finished`). ──
    // The odds feed sometimes finishes a match without ever delivering a final score, so those staked
    // positions would stay "Active" forever. Once SETTLE_FALLBACK_HOURS have passed since kickoff a
    // real score clearly isn't coming, so we resolve to the pre-match favorite from the frozen closing
    // odds. NO-LOSS makes this safe: settling to any outcome returns every staker's principal — only
    // the yield prize follows the guessed result. Each eligible match gets a synthetic score persisted
    // here, then folds into the SAME settle loop below as if the feed had scored it (one code path).
    const scoreless = db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.status, 'FINISHED'),
          isNull(matches.homeScore),
          inArray(matches.id, betMatchIds),
        ),
      )
      .all();

    const fallbackHours = env.SETTLE_FALLBACK_HOURS;
    const estimatedMatches: typeof finished = [];
    for (const match of scoreless) {
      const deadlineMs = (match.kickoff + fallbackHours * 3600) * 1000;
      // Not past the deadline yet → leave it for a later pass (a real score may still arrive).
      if (now() < deadlineMs) continue;
      try {
        const score = estimateScoreFromOdds(match);
        db.update(matches)
          .set({ homeScore: score.homeScore, awayScore: score.awayScore, updatedAt: now() })
          .where(eq(matches.id, match.id))
          .run();
        summary.estimated += 1;
        console.log(
          `[reconcile] estimated ${match.id} → ${score.homeScore}-${score.awayScore} ` +
            `(favorite; no feed score after ${fallbackHours}h)`,
        );
        // Carry the synthetic score into the settle loop so it settles on this same pass.
        estimatedMatches.push({ ...match, homeScore: score.homeScore, awayScore: score.awayScore });
      } catch (error) {
        summary.errors += 1;
        const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
        console.warn(`[reconcile] estimate failed for ${match.id}: ${reason}`);
      }
    }

    // One settle code path for both real-score and estimated matches.
    for (const match of [...finished, ...estimatedMatches]) {
      // Redundant with the SQL filter, but narrows the nullable columns for TS + resolveOutcome.
      if (match.homeScore === null || match.awayScore === null) continue;
      const result = resolveOutcome({ homeScore: match.homeScore, awayScore: match.awayScore });
      const marketId = marketIdFor(match.id);

      // ── On-chain: re-settle a market still OPEN (the one-shot settle at FINISHED leaked). ──
      // Guarded by settleOnchain — without an oracle key we can't retry, so skip the read entirely.
      if (settleOnchain) {
        try {
          const status = await readStatus(marketId);
          if (status === 'OPEN') {
            await settleOnchain(match.id, result);
            summary.onchainSettled += 1;
          } else {
            // SETTLED (already done) or NONE (no market) → nothing to retry on-chain.
            summary.skipped += 1;
          }
        } catch (error) {
          summary.errors += 1;
          const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
          console.warn(`[reconcile] settle failed for ${match.id}: ${reason}`);
        }
      }

      // ── Off-chain: settle the pot only if this match still has unsettled predictions. ──
      try {
        const unsettled = db
          .select({ id: predictions.id })
          .from(predictions)
          .where(and(eq(predictions.matchId, match.id), eq(predictions.settled, false)))
          .get();
        if (unsettled) {
          predictionService.settleMatch(match.id);
          summary.offchainSettled += 1;
        }
      } catch (error) {
        summary.errors += 1;
        const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
        console.warn(`[reconcile] off-chain settle failed for ${match.id}: ${reason}`);
      }
    }

    // One observable line per run — no more silent failures.
    console.log(
      `[reconcile] onchain=${summary.onchainSettled} offchain=${summary.offchainSettled} ` +
        `skipped=${summary.skipped} estimated=${summary.estimated} errors=${summary.errors}`,
    );
    return summary;
  }

  return { reconcile };
}
