import { ARBITRUM, type Outcome, resolveOutcome } from '@goaly/core';
import {
  createArbitrumClient,
  type MarketStatus,
  marketIdFor,
  readMarketStatus,
} from '@goaly/plugin-onchain';
import { and, eq, gte, inArray, isNotNull, or } from 'drizzle-orm';
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
      errors: 0,
    };

    // Reconcile a match if it EITHER carries stakes (predictions) OR finished recently. Staked
    // matches are where funds can be stuck; recent matches catch no-stake markets the one-shot
    // settle missed (e.g. the oracle was out of gas at kickoff). Both sets are small, so we avoid
    // an on-chain read per historical fixture (there can be hundreds) that would time out the pass.
    const RECENT_WINDOW_S = 3 * 24 * 60 * 60; // 3 days
    const recentCutoff = Math.floor(Date.now() / 1000) - RECENT_WINDOW_S;
    const betMatchIds = db
      .selectDistinct({ matchId: predictions.matchId })
      .from(predictions)
      .all()
      .map((r) => r.matchId);

    const recentOrStaked =
      betMatchIds.length > 0
        ? or(gte(matches.kickoff, recentCutoff), inArray(matches.id, betMatchIds))
        : gte(matches.kickoff, recentCutoff);

    const finished = db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.status, 'FINISHED'),
          isNotNull(matches.homeScore),
          isNotNull(matches.awayScore),
          recentOrStaked,
        ),
      )
      .all();

    for (const match of finished) {
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
        `skipped=${summary.skipped} errors=${summary.errors}`,
    );
    return summary;
  }

  return { reconcile };
}
