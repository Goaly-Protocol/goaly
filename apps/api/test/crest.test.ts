import { describe, expect, test } from 'bun:test';
import { createDb } from '../src/db/client';
import { CrestService } from '../src/services/crest.service';

function fetchReturning(teams: unknown[], counter?: { n: number }): typeof fetch {
  return (async () => {
    if (counter) counter.n += 1;
    return { ok: true, json: async () => ({ teams }) };
  }) as unknown as typeof fetch;
}

describe('CrestService', () => {
  test('resolves + caches a crest', async () => {
    const { db } = createDb(':memory:');
    const counter = { n: 0 };
    const svc = new CrestService(
      db,
      fetchReturning([{ strSport: 'Soccer', strTeamBadge: 'https://badge/x.png' }], counter),
      () => 1,
    );
    await svc.resolve(['Fortaleza CE']);
    expect(svc.get('Fortaleza CE')).toBe('https://badge/x.png');
    expect(counter.n).toBe(1);
    await svc.resolve(['Fortaleza CE']); // cached
    expect(counter.n).toBe(1);
  });

  test('caches misses as null so they are not looked up again', async () => {
    const { db } = createDb(':memory:');
    const counter = { n: 0 };
    const svc = new CrestService(db, fetchReturning([], counter), () => 1);
    await svc.resolve(['Obscure United']);
    expect(svc.get('Obscure United')).toBeNull();
    await svc.resolve(['Obscure United']);
    expect(counter.n).toBe(1);
  });

  test('resolve is bounded per call', async () => {
    const { db } = createDb(':memory:');
    const svc = new CrestService(db, fetchReturning([]), () => 1);
    const names = Array.from({ length: 20 }, (_, i) => `Team ${i}`);
    expect(await svc.resolve(names)).toBe(6); // BATCH
  });
});
