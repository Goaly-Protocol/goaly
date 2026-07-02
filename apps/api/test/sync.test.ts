import type { Match } from '@goalyield/core';
import { describe, expect, test } from 'bun:test';
import { createDb } from '../src/db/client';
import { apiUsage } from '../src/db/schema';
import { loadEnv } from '../src/env';
import { MockSportsProvider } from '../src/providers/sports';
import type { OddsEntry, ProviderResult } from '../src/providers/sports';
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
});
