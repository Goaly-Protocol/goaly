import { and, desc, eq, lt } from 'drizzle-orm';
import type { Env } from '../env';
import type { DB } from '../db/client';
import { apiUsage, matches, oddsCache, syncState } from '../db/schema';
import type { QuotaInfo, SportsDataProvider } from '@goaly/plugin-odds';

export interface SyncDeps {
  db: DB;
  provider: SportsDataProvider;
  env: Env;
  /** Number of configured API keys (for budget headroom estimate). */
  keyCount?: number;
  now?: () => number;
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

  async tick(): Promise<{ events: number; settled: number; odds: number }> {
    const events = await this.syncEvents();
    const settled = await this.syncScores();
    const odds = await this.syncOdds();
    return { events, settled, odds };
  }

  /** FREE: refresh fixtures + kickoff times. */
  async syncEvents(): Promise<number> {
    const { db, provider, env } = this.deps;
    const { data, quota } = await provider.listEvents(env.ODDS_SPORT_KEY);
    const ts = this.now();
    for (const match of data) {
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
    }
    this.record('scores', quota);
    this.touch('scores');
    return updated;
  }

  /** markets × regions credits: only when due and above the reserve. */
  async syncOdds(): Promise<number> {
    const { db, provider, env } = this.deps;
    if (!this.due('odds', env.ODDS_REFRESH_INTERVAL_MS)) return 0;

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
