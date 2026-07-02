import { describe, expect, test } from 'bun:test';
import { createIndexerClient } from '../src/services/indexer';

function stubFetch(response: unknown, ok = true, status = 200): typeof fetch {
  return (async () => ({ ok, status, json: async () => response })) as unknown as typeof fetch;
}

describe('indexer client', () => {
  test('parses goUSDT balance from the GraphQL response', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch({ data: { account: { balance: '100000000' } } });
    try {
      const client = createIndexerClient('http://localhost:42069');
      expect(await client.goUsdtBalance('0xABC')).toBe(100_000_000n);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('returns null when the account is not indexed', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch({ data: { account: null } });
    try {
      const client = createIndexerClient('http://localhost:42069/');
      expect(await client.goUsdtBalance('0xABC')).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });

  test('throws on a non-200 response so callers can fall back to RPC', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch({}, false, 503);
    try {
      const client = createIndexerClient('http://localhost:42069');
      await expect(client.goUsdtBalance('0xABC')).rejects.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });
});
