import { describe, expect, test } from 'bun:test';
import { createDb } from '../src/db/client';
import { CrestService } from '../src/services/crest.service';

function makeFetch(handler: (url: string) => unknown, searchCounter?: { n: number }): typeof fetch {
  return (async (url: string) => {
    if (searchCounter && url.includes('wbsearchentities')) searchCounter.n += 1;
    return { ok: true, json: async () => handler(url) };
  }) as unknown as typeof fetch;
}

const wikidataLogo = (url: string): unknown => {
  if (url.includes('wbsearchentities')) return { search: [{ id: 'Q1' }] };
  if (url.includes('wbgetclaims'))
    return { claims: { P154: [{ mainsnak: { datavalue: { value: 'Logo.png' } } }] } };
  return {};
};

describe('CrestService', () => {
  test('resolves a Wikidata P154 logo and caches it', async () => {
    const { db } = createDb(':memory:');
    const counter = { n: 0 };
    const svc = new CrestService(db, makeFetch(wikidataLogo, counter), () => 1);
    await svc.resolve(['Huachipato']);
    expect(svc.get('Huachipato')).toContain('Special:FilePath/Logo.png');
    expect(counter.n).toBe(1);
    await svc.resolve(['Huachipato']); // cached — no new lookup
    expect(counter.n).toBe(1);
  });

  test('falls back to a Wikipedia crest but rejects photo (.jpg) lead images', async () => {
    const { db } = createDb(':memory:');
    const svc = new CrestService(
      db,
      makeFetch((url) => {
        if (url.includes('wbsearchentities')) return { search: [] }; // no Wikidata logo
        if (url.includes('en.wikipedia.org')) {
          const source = url.includes('Photo') ? 'https://up/Player.jpg' : 'https://up/Logo.png';
          return { query: { pages: { '1': { original: { source } } } } };
        }
        return {};
      }),
      () => 1,
    );
    await svc.resolve(['Logo Team']);
    expect(svc.get('Logo Team')).toBe('https://up/Logo.png');
    await svc.resolve(['Photo Team']);
    expect(svc.get('Photo Team')).toBeNull();
  });

  test('caches misses as null so they are not looked up again', async () => {
    const { db } = createDb(':memory:');
    const counter = { n: 0 };
    const svc = new CrestService(
      db,
      makeFetch(() => ({ search: [], query: { pages: {} } }), counter),
      () => 1,
    );
    await svc.resolve(['Obscure United']);
    expect(svc.get('Obscure United')).toBeNull();
    await svc.resolve(['Obscure United']);
    expect(counter.n).toBe(1);
  });

  test('resolve is bounded per call', async () => {
    const { db } = createDb(':memory:');
    const svc = new CrestService(
      db,
      makeFetch(() => ({ search: [], query: { pages: {} } })),
      () => 1,
    );
    const names = Array.from({ length: 20 }, (_, i) => `Team ${i}`);
    expect(await svc.resolve(names)).toBe(6);
  });
});
