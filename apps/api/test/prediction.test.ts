import type { Match } from '@goaly/core';
import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { createDb } from '../src/db/client';
import { loadEnv } from '../src/env';
import { MockSportsProvider } from '@goaly/plugin-odds';
import { PredictionService } from '../src/services/prediction.service';
import { SyncService } from '../src/services/sync.service';

const NOW_MS = 1_000_000; // => 1000s, before the kickoff below
const now = () => NOW_MS;

function setup() {
  const env = loadEnv({
    DATABASE_URL: ':memory:',
    PROTOCOL_FEE_BPS: '250',
  } as unknown as NodeJS.ProcessEnv);
  const { db } = createDb(':memory:');
  const fixtures: Match[] = [
    {
      id: 'm1',
      homeTeam: 'Argentina',
      awayTeam: 'Brazil',
      kickoff: 2000,
      round: 'FINAL',
      status: 'SCHEDULED',
    },
  ];
  const provider = new MockSportsProvider(fixtures);
  const sync = new SyncService({ db, provider, env, now });
  const predictions = new PredictionService(db, BigInt(env.PROTOCOL_FEE_BPS), now);
  const app = createApp({ db, env, sync, predictions, now });
  return { app, sync };
}

async function postJson(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('prediction + settlement flow', () => {
  test('winners split the pot minus fee; losers keep their (on-chain) principal', async () => {
    const { app, sync } = setup();
    await sync.syncEvents();

    const list = (await (await app.request('/matches')).json()) as { matches: unknown[] };
    expect(list.matches).toHaveLength(1);

    const a = await postJson(app, '/predictions', {
      userId: 'alice',
      matchId: 'm1',
      pick: { market: 'WINNER', outcome: 'HOME' },
      stake: '10000000', // 10 USDT0
    });
    const b = await postJson(app, '/predictions', {
      userId: 'bob',
      matchId: 'm1',
      pick: { market: 'WINNER', outcome: 'AWAY' },
      stake: '10000000',
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    // Admin oracle records the final result, then we settle.
    const result = await postJson(app, '/admin/matches/m1/result', { homeScore: 2, awayScore: 1 });
    expect(result.status).toBe(200);

    const settle = await postJson(app, '/admin/matches/m1/settle', {});
    expect(settle.status).toBe(200);
    // pot 20, fee 2.5% = 0.5, distributable 19.5 all to Alice (the only winner).
    expect(settle.json.pot).toBe('20000000');
    expect(settle.json.fee).toBe('500000');
    expect(settle.json.winners).toBe(1);
    const payouts = settle.json.payouts as { id: string; payout: string }[];
    expect(payouts).toHaveLength(1);
    expect(payouts[0]?.payout).toBe('19500000');

    // Bob lost his staked credit but that is repaid by yield on-chain — his row is settled, not won.
    const bob = (await (await app.request('/predictions?userId=bob')).json()) as {
      predictions: { won: boolean; settled: boolean }[];
    };
    expect(bob.predictions[0]?.settled).toBe(true);
    expect(bob.predictions[0]?.won).toBe(false);
  });

  test('rejects predictions after kickoff', async () => {
    const { app, sync } = setup();
    await sync.syncEvents();
    await postJson(app, '/admin/matches/m1/result', { homeScore: 0, awayScore: 0 }); // now FINISHED
    const late = await postJson(app, '/predictions', {
      userId: 'carol',
      matchId: 'm1',
      pick: { market: 'WINNER', outcome: 'HOME' },
      stake: '1000000',
    });
    expect(late.status).toBe(409);
  });
});
