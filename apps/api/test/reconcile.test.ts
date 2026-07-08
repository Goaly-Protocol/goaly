import type { MarketStatus } from '@goaly/plugin-onchain';
import { MockSportsProvider } from '@goaly/plugin-odds';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Hex } from 'viem';
import { createApp } from '../src/app';
import { createDb } from '../src/db/client';
import type { DB } from '../src/db/client';
import { matches, predictions } from '../src/db/schema';
import { type Env, loadEnv } from '../src/env';
import { PredictionService } from '../src/services/prediction.service';
import {
  createReconciler,
  estimateScoreFromOdds,
  type Reconciler,
} from '../src/services/reconcile.service';
import { SyncService } from '../src/services/sync.service';

const now = () => 2_000_000;

function env(extra: Record<string, string> = {}): Env {
  return loadEnv({
    DATABASE_URL: ':memory:',
    PROTOCOL_FEE_BPS: '250',
    ...extra,
  } as unknown as NodeJS.ProcessEnv);
}

function seedFinishedMatch(db: DB, id: string, homeScore = 2, awayScore = 1): void {
  db.insert(matches)
    .values({
      id,
      sportKey: 'soccer_fifa_world_cup',
      homeTeam: 'Argentina',
      awayTeam: 'Brazil',
      kickoff: 1000,
      round: 'FINAL',
      status: 'FINISHED',
      homeScore,
      awayScore,
      updatedAt: now(),
    })
    .run();
}

/** A FINISHED match the feed never scored (homeScore/awayScore null), with frozen closing odds. */
function seedScorelessMatch(
  db: DB,
  id: string,
  odds: { home: number | null; draw: number | null; away: number | null },
  kickoff = 1000,
): void {
  db.insert(matches)
    .values({
      id,
      sportKey: 'soccer_fifa_world_cup',
      homeTeam: 'Argentina',
      awayTeam: 'Brazil',
      kickoff,
      round: 'FINAL',
      status: 'FINISHED',
      homeScore: null,
      awayScore: null,
      closingHomeBps: odds.home,
      closingDrawBps: odds.draw,
      closingAwayBps: odds.away,
      updatedAt: now(),
    })
    .run();
}

function seedPrediction(db: DB, id: string, matchId: string, settled = false): void {
  db.insert(predictions)
    .values({
      id,
      userId: 'alice',
      matchId,
      market: 'WINNER',
      pick: JSON.stringify({ market: 'WINNER', outcome: 'HOME' }),
      stake: '10000000',
      createdAt: now(),
      settled,
    })
    .run();
}

describe('settlement reconcile job', () => {
  test('re-settles a finished match whose market is still OPEN (on-chain + off-chain)', async () => {
    const { db } = createDb(':memory:');
    seedFinishedMatch(db, 'm1');
    seedPrediction(db, 'p1', 'm1');
    const predictionService = new PredictionService(db, 250n, now);

    const settled: { matchId: string; result: string }[] = [];
    const reconciler = createReconciler({
      db,
      env: env(),
      predictionService,
      settleOnchain: async (matchId, result) => {
        settled.push({ matchId, result });
      },
      readMarketStatus: async (_marketId: Hex): Promise<MarketStatus> => 'OPEN',
    });

    const summary = await reconciler.reconcile();
    expect(summary).toEqual({
      onchainSettled: 1,
      offchainSettled: 1,
      skipped: 0,
      estimated: 0,
      errors: 0,
    });
    // The retry actually invoked the on-chain settle with the resolved outcome (2-1 → HOME).
    expect(settled).toEqual([{ matchId: 'm1', result: 'HOME' }]);

    // Off-chain settled → the prediction row is now marked settled + won.
    const row = db.select().from(predictions).where(eq(predictions.id, 'p1')).get();
    expect(row?.settled).toBe(true);
    expect(row?.won).toBe(true);

    // A second pass is idempotent off-chain (nothing unsettled left) while still retrying on-chain
    // until the market reads back SETTLED — no double-payout, no crash.
    const again = await reconciler.reconcile();
    expect(again.offchainSettled).toBe(0);
    expect(again.onchainSettled).toBe(1);
  });

  test('skips on-chain settle when the market is already SETTLED', async () => {
    const { db } = createDb(':memory:');
    seedFinishedMatch(db, 'm2');
    seedPrediction(db, 'p2', 'm2', /* settled */ true); // nothing off-chain to do either
    const predictionService = new PredictionService(db, 250n, now);

    let settleCalls = 0;
    const reconciler = createReconciler({
      db,
      env: env(),
      predictionService,
      settleOnchain: async () => {
        settleCalls += 1;
      },
      readMarketStatus: async (): Promise<MarketStatus> => 'SETTLED',
    });

    const summary = await reconciler.reconcile();
    expect(settleCalls).toBe(0);
    expect(summary).toEqual({
      onchainSettled: 0,
      offchainSettled: 0,
      skipped: 1,
      estimated: 0,
      errors: 0,
    });
  });

  test('counts + logs a settle failure without throwing (one bad market cannot stall the loop)', async () => {
    const { db } = createDb(':memory:');
    seedFinishedMatch(db, 'bad');
    seedFinishedMatch(db, 'good');
    // Both matches have a stake (so both are scanned). 'bad' is already settled off-chain, so its
    // only work is the on-chain retry (which throws); 'good' still needs both layers.
    seedPrediction(db, 'p-bad', 'bad', /* settled */ true);
    seedPrediction(db, 'p-good', 'good');
    const predictionService = new PredictionService(db, 250n, now);

    const reconciler = createReconciler({
      db,
      env: env(),
      predictionService,
      settleOnchain: async (matchId) => {
        if (matchId === 'bad') throw new Error('out of gas\nrevert data...');
      },
      readMarketStatus: async (): Promise<MarketStatus> => 'OPEN',
    });

    const summary = await reconciler.reconcile();
    // 'bad' fails its on-chain settle (errors +1) but 'good' still settles both layers. Only 'good'
    // has a prediction, so off-chain settles exactly once.
    expect(summary.errors).toBe(1);
    expect(summary.onchainSettled).toBe(1);
    expect(summary.offchainSettled).toBe(1);
  });

  test('runs without ORACLE_PK — heals off-chain only, no on-chain read, no crash', async () => {
    const { db } = createDb(':memory:');
    seedFinishedMatch(db, 'm3');
    seedPrediction(db, 'p3', 'm3');
    const predictionService = new PredictionService(db, 250n, now);

    // No settleOnchain AND no readMarketStatus → the on-chain block is skipped entirely, so it must
    // never attempt an RPC read (would throw/hang here since there is no network stub).
    const reconciler = createReconciler({ db, env: env(), predictionService });

    const summary = await reconciler.reconcile();
    expect(summary).toEqual({
      onchainSettled: 0,
      offchainSettled: 1,
      skipped: 0,
      estimated: 0,
      errors: 0,
    });
  });

  test('deadline fallback: resolves a scoreless finished match from the odds favorite, then settles', async () => {
    const { db } = createDb(':memory:');
    // No feed score, HOME is the pre-match favorite (lowest closing bps). Kickoff long past the
    // default 6h fallback deadline (deadline = (1000 + 6*3600)*1000 = 22_600_000 ms < now).
    seedScorelessMatch(
      db,
      'm-fb',
      { home: 13_000, draw: 45_000, away: 90_000 },
      /* kickoff */ 1000,
    );
    seedPrediction(db, 'p-fb', 'm-fb');
    const clock = () => 30_000_000;
    const predictionService = new PredictionService(db, 250n, () => clock() /* ms */);

    const settled: { matchId: string; result: string }[] = [];
    let marketSettled = false;
    const reconciler = createReconciler({
      db,
      env: env(),
      predictionService,
      settleOnchain: async (matchId, result) => {
        settled.push({ matchId, result });
        marketSettled = true;
      },
      readMarketStatus: async (): Promise<MarketStatus> => (marketSettled ? 'SETTLED' : 'OPEN'),
      now: clock,
    });

    const summary = await reconciler.reconcile();
    expect(summary).toEqual({
      onchainSettled: 1,
      offchainSettled: 1,
      skipped: 0,
      estimated: 1,
      errors: 0,
    });
    // HOME favorite → synthetic 1-0 → resolveOutcome HOME → on-chain settled to HOME.
    expect(settled).toEqual([{ matchId: 'm-fb', result: 'HOME' }]);

    // Synthetic score persisted to the match row.
    const match = db.select().from(matches).where(eq(matches.id, 'm-fb')).get();
    expect(match?.homeScore).toBe(1);
    expect(match?.awayScore).toBe(0);

    // Off-chain settled the HOME staker.
    const prediction = db.select().from(predictions).where(eq(predictions.id, 'p-fb')).get();
    expect(prediction?.settled).toBe(true);
    expect(prediction?.won).toBe(true);

    // Idempotent: the next pass sees a normal scored match with a SETTLED market → no double settle.
    const again = await reconciler.reconcile();
    expect(again).toEqual({
      onchainSettled: 0,
      offchainSettled: 0,
      skipped: 1,
      estimated: 0,
      errors: 0,
    });
    expect(settled).toHaveLength(1);
  });

  test('deadline fallback: leaves a scoreless match untouched before the deadline', async () => {
    const { db } = createDb(':memory:');
    // now() = 2_000_000 ms, deadline = (1000 + 6*3600)*1000 = 22_600_000 ms → not yet due.
    seedScorelessMatch(db, 'm-early', { home: 13_000, draw: 45_000, away: 90_000 });
    seedPrediction(db, 'p-early', 'm-early');
    const predictionService = new PredictionService(db, 250n, now);

    let settleCalls = 0;
    const reconciler = createReconciler({
      db,
      env: env(),
      predictionService,
      settleOnchain: async () => {
        settleCalls += 1;
      },
      readMarketStatus: async (): Promise<MarketStatus> => 'OPEN',
      now,
    });

    const summary = await reconciler.reconcile();
    expect(summary).toEqual({
      onchainSettled: 0,
      offchainSettled: 0,
      skipped: 0,
      estimated: 0,
      errors: 0,
    });
    expect(settleCalls).toBe(0);

    // No synthetic score written, prediction still Active.
    const match = db.select().from(matches).where(eq(matches.id, 'm-early')).get();
    expect(match?.homeScore).toBeNull();
    expect(match?.awayScore).toBeNull();
    const prediction = db.select().from(predictions).where(eq(predictions.id, 'p-early')).get();
    expect(prediction?.settled).toBe(false);
  });

  test('deadline fallback honours SETTLE_FALLBACK_HOURS (a shorter deadline makes a match due)', async () => {
    const { db } = createDb(':memory:');
    // With the default 6h this match would NOT be due at now()=2_000_000; with 1h it is
    // (deadline = (1000 + 3600)*1000 = 4_600_000 ms) — still not due at 2M... use a later clock.
    seedScorelessMatch(db, 'm-cfg', { home: 90_000, draw: 45_000, away: 12_000 });
    seedPrediction(db, 'p-cfg', 'm-cfg');
    const clock = () => 5_000_000; // > (1000 + 1*3600)*1000 = 4_600_000
    const predictionService = new PredictionService(db, 250n, clock);

    const settled: { matchId: string; result: string }[] = [];
    const reconciler = createReconciler({
      db,
      env: env({ SETTLE_FALLBACK_HOURS: '1' }),
      predictionService,
      settleOnchain: async (matchId, result) => {
        settled.push({ matchId, result });
      },
      readMarketStatus: async (): Promise<MarketStatus> => 'OPEN',
      now: clock,
    });

    const summary = await reconciler.reconcile();
    expect(summary.estimated).toBe(1);
    // AWAY favorite (lowest bps) → synthetic 0-1 → resolveOutcome AWAY.
    expect(settled).toEqual([{ matchId: 'm-cfg', result: 'AWAY' }]);
    const match = db.select().from(matches).where(eq(matches.id, 'm-cfg')).get();
    expect(match?.homeScore).toBe(0);
    expect(match?.awayScore).toBe(1);
  });
});

describe('estimateScoreFromOdds', () => {
  test('HOME favorite (lowest bps) → 1-0', () => {
    expect(
      estimateScoreFromOdds({
        closingHomeBps: 13_000,
        closingDrawBps: 40_000,
        closingAwayBps: 90_000,
      }),
    ).toEqual({
      homeScore: 1,
      awayScore: 0,
    });
  });

  test('AWAY favorite (lowest bps) → 0-1', () => {
    expect(
      estimateScoreFromOdds({
        closingHomeBps: 90_000,
        closingDrawBps: 40_000,
        closingAwayBps: 12_000,
      }),
    ).toEqual({
      homeScore: 0,
      awayScore: 1,
    });
  });

  test('DRAW favorite (lowest bps) → 0-0', () => {
    expect(
      estimateScoreFromOdds({
        closingHomeBps: 30_000,
        closingDrawBps: 21_000,
        closingAwayBps: 33_000,
      }),
    ).toEqual({
      homeScore: 0,
      awayScore: 0,
    });
  });

  test('all odds null → 0-0 (DRAW)', () => {
    expect(
      estimateScoreFromOdds({ closingHomeBps: null, closingDrawBps: null, closingAwayBps: null }),
    ).toEqual({
      homeScore: 0,
      awayScore: 0,
    });
  });

  test('partial-null: picks the favorite among the non-null outcomes', () => {
    // Only HOME + AWAY present; AWAY is shorter → AWAY favorite → 0-1.
    expect(
      estimateScoreFromOdds({
        closingHomeBps: 25_000,
        closingDrawBps: null,
        closingAwayBps: 14_000,
      }),
    ).toEqual({
      homeScore: 0,
      awayScore: 1,
    });
    // Only HOME present → HOME favorite → 1-0.
    expect(
      estimateScoreFromOdds({ closingHomeBps: 18_000, closingDrawBps: null, closingAwayBps: null }),
    ).toEqual({
      homeScore: 1,
      awayScore: 0,
    });
  });
});

describe('POST /admin/reconcile', () => {
  function appWith(reconciler?: Reconciler, extraEnv: Record<string, string> = {}) {
    const { db } = createDb(':memory:');
    const e = env(extraEnv);
    const sync = new SyncService({ db, provider: new MockSportsProvider([]), env: e, now });
    const predictionService = new PredictionService(db, BigInt(e.PROTOCOL_FEE_BPS), now);
    const app = createApp({
      db,
      env: e,
      sync,
      predictions: predictionService,
      ...(reconciler ? { reconciler } : {}),
      now,
    });
    return { app, db };
  }

  test('returns the reconcile summary as JSON (injected reconciler)', async () => {
    const stub: Reconciler = {
      reconcile: async () => ({
        onchainSettled: 1,
        offchainSettled: 2,
        skipped: 3,
        estimated: 4,
        errors: 0,
      }),
    };
    const { app } = appWith(stub);
    const res = await app.request('/admin/reconcile', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      onchainSettled: 1,
      offchainSettled: 2,
      skipped: 3,
      estimated: 4,
      errors: 0,
    });
  });

  test('default reconciler (no ORACLE_PK) no-ops without crashing or hitting the network', async () => {
    // No reconciler injected → createApp builds one from env. With no finished matches the loop body
    // never runs, so there is no on-chain read even though ORACLE_PK is unset.
    const { app } = appWith();
    const res = await app.request('/admin/reconcile', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      onchainSettled: 0,
      offchainSettled: 0,
      skipped: 0,
      estimated: 0,
      errors: 0,
    });
  });
});
