import type { Match } from '@goaly/core';
import { describe, expect, test } from 'bun:test';
import { createDb } from '../src/db/client';
import { apiUsage } from '../src/db/schema';
import { loadEnv } from '../src/env';
import { MockSportsProvider } from '@goaly/plugin-odds';
import type { OddsEntry, ProviderResult } from '@goaly/plugin-odds';
import { SyncService } from '../src/services/sync.service';

/** Counts provider calls so we can assert credits are never spent needlessly. */
class CountingProvider extends MockSportsProvider {
  events = 0;
  odds = 0;
  override async listEvents() {
    this.events += 1;
    return super.listEvents();
  }
  override async listOdds(): Promise<ProviderResult<OddsEntry[]>> {
    this.odds += 1;
    return super.listOdds();
  }
}

function env(overrides: Record<string, string> = {}) {
  return loadEnv({
    DATABASE_URL: ':memory:',
    ODDS_REFRESH_INTERVAL_MS: '0',
    ...overrides,
  } as unknown as NodeJS.ProcessEnv);
}

const fixture: Match = {
  id: 'm1',
  homeTeam: 'A',
  awayTeam: 'B',
  kickoff: 10,
  round: 'GROUP',
  status: 'SCHEDULED',
};

describe('SyncService credit strategy', () => {
  test('events sync is free and always runs', async () => {
    const { db } = createDb(':memory:');
    const provider = new CountingProvider([fixture]);
    const sync = new SyncService({ db, provider, env: env(), now: () => 1_000_000_000 });
    expect(await sync.syncEvents()).toBe(1);
    expect(provider.events).toBe(1);
  });

  test('odds refresh is skipped below the credit reserve (protects settlement)', async () => {
    const { db } = createDb(':memory:');
    const provider = new CountingProvider();
    const sync = new SyncService({
      db,
      provider,
      env: env({ ODDS_CREDIT_RESERVE: '80' }),
      now: () => 1e9,
    });
    db.insert(apiUsage).values({ ts: 1, endpoint: 'scores', cost: 1, remaining: 10 }).run();
    expect(await sync.syncOdds()).toBe(0);
    expect(provider.odds).toBe(0); // never called
  });

  test('odds refresh runs when credits are healthy', async () => {
    const { db } = createDb(':memory:');
    const provider = new CountingProvider();
    const sync = new SyncService({
      db,
      provider,
      env: env({ ODDS_CREDIT_RESERVE: '80' }),
      now: () => 1e9,
    });
    await sync.syncOdds(); // no usage rows => full monthly budget assumed
    expect(provider.odds).toBe(1);
  });

  test('extra API keys multiply the budget headroom', () => {
    const { db } = createDb(':memory:');
    const sync = new SyncService({
      db,
      provider: new CountingProvider(),
      env: env(),
      keyCount: 3,
      now: () => 1,
    });
    db.insert(apiUsage).values({ ts: 1, endpoint: 'odds', cost: 1, remaining: 10 }).run();
    expect(sync.creditsRemaining()).toBe(10 + 2 * 500);
  });

  test('auto-settles on-chain when a match finishes', async () => {
    const { db } = createDb(':memory:');
    const provider = new MockSportsProvider([
      {
        id: 'm1',
        homeTeam: 'Argentina',
        awayTeam: 'Brazil',
        kickoff: 100,
        round: 'FINAL',
        status: 'SCHEDULED',
      },
    ]);
    provider.setResult('m1', { homeScore: 2, awayScore: 1 });
    const settled: Array<{ matchId: string; result: string }> = [];
    const sync = new SyncService({
      db,
      provider,
      env: env({ ODDS_SCORES_INTERVAL_MS: '0', ODDS_SETTLE_BUFFER_S: '0' }),
      now: () => 1_000_000_000,
      settleOnchain: async (matchId, result) => {
        settled.push({ matchId, result });
      },
    });
    await sync.syncEvents();
    expect(await sync.syncScores()).toBe(1);
    expect(settled).toEqual([{ matchId: 'm1', result: 'HOME' }]);
  });

  test('opens an on-chain market once per new fixture', async () => {
    const { db } = createDb(':memory:');
    const provider = new MockSportsProvider([
      {
        id: 'm1',
        homeTeam: 'Argentina',
        awayTeam: 'Brazil',
        kickoff: 4_200,
        round: 'FINAL',
        status: 'SCHEDULED',
      },
    ]);
    const created: Array<{ matchId: string; closeTime: number }> = [];
    const sync = new SyncService({
      db,
      provider,
      env: env(),
      createMarketOnchain: async (matchId, closeTime) => {
        created.push({ matchId, closeTime });
      },
    });

    await sync.syncEvents();
    await sync.syncEvents(); // second pass: fixture already known
    expect(created).toEqual([{ matchId: 'm1', closeTime: 4_200 }]);
  });
});
