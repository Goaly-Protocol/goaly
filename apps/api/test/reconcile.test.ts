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
import { createReconciler, type Reconciler } from '../src/services/reconcile.service';
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
    expect(summary).toEqual({ onchainSettled: 1, offchainSettled: 1, skipped: 0, errors: 0 });
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
    expect(summary).toEqual({ onchainSettled: 0, offchainSettled: 0, skipped: 1, errors: 0 });
  });

  test('counts + logs a settle failure without throwing (one bad market cannot stall the loop)', async () => {
    const { db } = createDb(':memory:');
    seedFinishedMatch(db, 'bad');
    seedFinishedMatch(db, 'good');
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
    expect(summary).toEqual({ onchainSettled: 0, offchainSettled: 1, skipped: 0, errors: 0 });
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
      reconcile: async () => ({ onchainSettled: 1, offchainSettled: 2, skipped: 3, errors: 0 }),
    };
    const { app } = appWith(stub);
    const res = await app.request('/admin/reconcile', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      onchainSettled: 1,
      offchainSettled: 2,
      skipped: 3,
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
      errors: 0,
    });
  });
});
