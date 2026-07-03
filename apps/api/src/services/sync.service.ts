import { type MatchResult, type Outcome, resolveOutcome } from '@goaly/core';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Env } from '../env';
import type { DB } from '../db/client';
import { apiUsage, matches, oddsCache, syncState } from '../db/schema';
import { isRealMatch } from '../lib/match-filter';
import { parseH2hOdds } from '../lib/odds';
import { LIVE_MATCH_WINDOW_S, type QuotaInfo, type SportsDataProvider } from '@goaly/plugin-odds';

export interface SyncDeps {
  db: DB;
  provider: SportsDataProvider;
  env: Env;
  /** Number of configured API keys (for budget headroom estimate). */
  keyCount?: number;
  now?: () => number;
  /** Optional hook: settle the on-chain market when a match finishes. */
  settleOnchain?: (matchId: string, result: Outcome) => Promise<void>;
  /** Optional hook: open the on-chain market when a new fixture first appears. */
  createMarketOnchain?: (matchId: string, closeTime: number) => Promise<void>;
}

/**
 * Fills the local cache from the sports provider while respecting the credit
 * budget. Design rules:
 *  - `/events` is FREE → always safe, our source of fixtures + kickoff times.
 *  - `/scores` (1 credit) → only when due AND a match should have finished.
 *  - `/odds` (markets × regions) → only when due AND we are above the reserve.
 * User requests never trigger provider calls; only `tick()` does.
 */
export class SyncService {
  private readonly now: () => number;
  private readonly keyCount: number;

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.keyCount = deps.keyCount ?? 1;
  }

  /** Best estimate of credits left across all keys (last header value + spare keys). */
  creditsRemaining(): number {
    const { db, env } = this.deps;
    const last = db.select().from(apiUsage).orderBy(desc(apiUsage.id)).limit(1).get();
    const currentKey = last?.remaining ?? env.ODDS_MONTHLY_CREDITS;
    const spareKeys = Math.max(0, this.keyCount - 1);
    return currentKey + spareKeys * env.ODDS_MONTHLY_CREDITS;
  }

  async tick(): Promise<{ events: number; settled: number; odds: number; frozen: number }> {
    const events = await this.syncEvents();
    const settled = await this.syncScores();
    const odds = await this.syncOdds();
    const frozen = this.freezeClosingOdds();
    return { events, settled, odds, frozen };
  }

  /** FREE: refresh fixtures + kickoff times. */
  async syncEvents(): Promise<number> {
    const { db, provider, env } = this.deps;
    const { data, quota } = await provider.listEvents(env.ODDS_SPORT_KEY);
    const ts = this.now();
    for (const match of data) {
      // Drop aggregate/placeholder feed rows ("Home Team - Friday - 3 Matches") — not real fixtures.
      if (!isRealMatch(match.homeTeam, match.awayTeam)) continue;
      const known = db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.id, match.id))
        .get();
      db.insert(matches)
        .values({
          id: match.id,
          sportKey: env.ODDS_SPORT_KEY,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          kickoff: match.kickoff,
          round: match.round,
          status: match.status,
          updatedAt: ts,
        })
        .onConflictDoUpdate({
          target: matches.id,
          set: {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            kickoff: match.kickoff,
            updatedAt: ts,
          },
        })
        .run();
      // Market stays open through the live match, so close time = kickoff + the live window.
      // Fire-and-forget so a big board inserts instantly; the KeyWallet serialises on-chain creates.
      if (!known) void this.createMarketOnchainSafe(match.id, match.kickoff + LIVE_MATCH_WINDOW_S);
    }

    // A started match that dropped out of the feed has finished — stop showing it as bettable.
    // Guard on a non-empty feed so a transient empty response doesn't finish everything.
    if (data.length > 0) {
      const feedIds = new Set(data.map((m) => m.id));
      const nowS = Math.floor(ts / 1000);
      const started = db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.status, 'SCHEDULED'), lt(matches.kickoff, nowS)))
        .all();
      for (const s of started) {
        if (!feedIds.has(s.id)) {
          db.update(matches)
            .set({ status: 'FINISHED', updatedAt: ts })
            .where(eq(matches.id, s.id))
            .run();
        }
      }
    }

    this.record('events', quota);
    return data.length;
  }

  /** 1–2 credits: only when due and there are matches that should have finished. */
  async syncScores(): Promise<number> {
    const { db, provider, env } = this.deps;
    if (!this.due('scores', env.ODDS_SCORES_INTERVAL_MS)) return 0;

    const cutoff = Math.floor(this.now() / 1000) - env.ODDS_SETTLE_BUFFER_S;
    const pending = db
      .select()
      .from(matches)
      .where(and(eq(matches.status, 'SCHEDULED'), lt(matches.kickoff, cutoff)))
      .all();
    if (pending.length === 0) return 0;

    const { data, quota } = await provider.listScores(env.ODDS_SPORT_KEY, { daysFrom: 3 });
    const ts = this.now();
    let updated = 0;
    for (const score of data) {
      if (!score.completed) continue;
      db.update(matches)
        .set({
          status: 'FINISHED',
          homeScore: score.result.homeScore,
          awayScore: score.result.awayScore,
          updatedAt: ts,
        })
        .where(eq(matches.id, score.matchId))
        .run();
      updated += 1;
      await this.settleOnchainSafe(score.matchId, score.result);
    }
    this.record('scores', quota);
    this.touch('scores');
    return updated;
  }

  /** markets × regions credits: only when due and above the reserve. */
  async syncOdds(): Promise<number> {
    const { db, provider, env } = this.deps;
    if (!this.due('odds', env.ODDS_REFRESH_INTERVAL_MS)) return 0;

    // Refresh odds for any still-bettable match: upcoming, or live (kicked off within the window).
    const nowS = Math.floor(this.now() / 1000);
    const approaching = db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.status, 'SCHEDULED'),
          gt(matches.kickoff, nowS - LIVE_MATCH_WINDOW_S),
          lt(matches.kickoff, nowS + env.ODDS_FETCH_BEFORE_S),
        ),
      )
      .all();
    if (approaching.length === 0) {
      this.touch('odds');
      return 0;
    }

    const remaining = this.creditsRemaining();
    if (remaining <= env.ODDS_CREDIT_RESERVE) {
      console.warn(
        `[sync] skipping odds refresh to protect settlement budget (` +
          `~${remaining} credits <= reserve ${env.ODDS_CREDIT_RESERVE})`,
      );
      return 0;
    }

    const { data, quota } = await provider.listOdds(env.ODDS_SPORT_KEY, {
      regions: env.ODDS_REGION,
      markets: env.ODDS_MARKETS,
    });
    const ts = this.now();
    for (const entry of data) {
      db.insert(oddsCache)
        .values({
          matchId: entry.matchId,
          market: entry.market,
          data: JSON.stringify(entry.data),
          fetchedAt: ts,
        })
        .onConflictDoUpdate({
          target: oddsCache.matchId,
          set: { market: entry.market, data: JSON.stringify(entry.data), fetchedAt: ts },
        })
        .run();
    }
    this.record('odds', quota);
    this.touch('odds');
    return data.length;
  }

  /**
   * Freeze closing odds for matches that have kicked off (betting closed): copy the last cached h2h
   * odds onto the match as ×10_000 bps. This is the deterministic reference the on-chain boost uses
   * at settlement — no further odds fetch is needed after kickoff. Returns how many were frozen.
   */
  freezeClosingOdds(): number {
    const { db } = this.deps;
    const nowS = Math.floor(this.now() / 1000);
    const closing = db
      .select()
      .from(matches)
      .where(and(lt(matches.kickoff, nowS), isNull(matches.closingHomeBps)))
      .all();
    let frozen = 0;
    for (const match of closing) {
      const cached = db.select().from(oddsCache).where(eq(oddsCache.matchId, match.id)).get();
      const odds = cached ? parseH2hOdds(cached.data, match.homeTeam, match.awayTeam) : null;
      if (!odds) continue;
      db.update(matches)
        .set({
          closingHomeBps: Math.round(odds.home * 10_000),
          closingDrawBps: Math.round(odds.draw * 10_000),
          closingAwayBps: Math.round(odds.away * 10_000),
        })
        .where(eq(matches.id, match.id))
        .run();
      frozen += 1;
    }
    return frozen;
  }

  /** Best-effort on-chain settlement — never breaks the sync loop. */
  private async settleOnchainSafe(matchId: string, result: MatchResult): Promise<void> {
    if (!this.deps.settleOnchain) return;
    try {
      await this.deps.settleOnchain(matchId, resolveOutcome(result));
    } catch (error) {
      console.error(`[sync] on-chain settle failed for ${matchId}`, error);
    }
  }

  /** Best-effort on-chain market creation — never breaks the sync loop. */
  private async createMarketOnchainSafe(matchId: string, closeTime: number): Promise<void> {
    if (!this.deps.createMarketOnchain) return;
    try {
      await this.deps.createMarketOnchain(matchId, closeTime);
    } catch (error) {
      // Usually a benign "already exists" revert (stable market id from a prior run) — keep it terse.
      const msg = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.warn(`[sync] createMarket skipped for ${matchId}: ${msg}`);
    }
  }

  private record(endpoint: string, quota?: QuotaInfo): void {
    this.deps.db
      .insert(apiUsage)
      .values({
        ts: this.now(),
        endpoint,
        cost: quota?.lastCost ?? 0,
        remaining: quota?.remaining ?? null,
      })
      .run();
  }

  private due(key: string, intervalMs: number): boolean {
    const row = this.deps.db.select().from(syncState).where(eq(syncState.key, key)).get();
    return this.now() - (row?.lastRunAt ?? 0) >= intervalMs;
  }

  private touch(key: string): void {
    const lastRunAt = this.now();
    this.deps.db
      .insert(syncState)
      .values({ key, lastRunAt })
      .onConflictDoUpdate({ target: syncState.key, set: { lastRunAt } })
      .run();
  }
}
