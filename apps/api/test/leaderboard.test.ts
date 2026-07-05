import { afterEach, describe, expect, test } from 'bun:test';
import { MockSportsProvider } from '@goaly/plugin-odds';
import { createApp } from '../src/app';
import { createDb } from '../src/db/client';
import { loadEnv } from '../src/env';
import { PredictionService } from '../src/services/prediction.service';
import { SyncService } from '../src/services/sync.service';

const now = () => 1_000_000;

function setup() {
  const env = loadEnv({
    DATABASE_URL: ':memory:',
    PROTOCOL_FEE_BPS: '250',
  } as unknown as NodeJS.ProcessEnv);
  const { db } = createDb(':memory:');
  const provider = new MockSportsProvider([]);
  const sync = new SyncService({ db, provider, env, now });
  const predictions = new PredictionService(db, BigInt(env.PROTOCOL_FEE_BPS), now);
  const app = createApp({ db, env, sync, predictions, now });
  return { app };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// A canned Ponder GraphQL response — BigInt columns come back as decimal strings.
function mockIndexer(users: unknown[]) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: { users: { items: users } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('GET /leaderboard', () => {
  test('maps the indexer user aggregate to the leaderboard shape', async () => {
    const { app } = setup();
    mockIndexer([
      {
        address: '0xabc',
        totalStaked: '5000000',
        totalPrize: '1500000',
        predictionCount: 3,
        claimCount: 2,
      },
      {
        address: '0xdef',
        totalStaked: '1000000',
        totalPrize: '0',
        predictionCount: 1,
        claimCount: 0,
      },
    ]);

    const res = await app.request('/leaderboard?limit=10');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      leaderboard: {
        address: string;
        predictions: number;
        totalStaked: string;
        wins: number;
        volume: string;
      }[];
    };
    expect(body.leaderboard).toHaveLength(2);
    expect(body.leaderboard[0]).toEqual({
      address: '0xabc',
      predictions: 3,
      totalStaked: '5000000',
      wins: 2,
      volume: '6500000', // totalStaked + totalPrize
    });
    expect(body.leaderboard[1]?.volume).toBe('1000000');
  });

  test('returns an empty leaderboard (200) when the indexer is unreachable', async () => {
    const { app } = setup();
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const res = await app.request('/leaderboard');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ leaderboard: [] });
  });
});

describe('GET /markets', () => {
  test('returns an empty markets array (200) when the indexer is unreachable', async () => {
    const { app } = setup();
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const res = await app.request('/markets');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ markets: [] });
  });
});
