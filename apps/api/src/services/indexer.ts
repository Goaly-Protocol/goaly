export interface IndexerClient {
  /** goUSDT balance for an address from the indexer, or null if the account isn't indexed yet. */
  goUsdtBalance(address: string): Promise<bigint | null>;
}

/**
 * Client for the Ponder indexer's GraphQL API. Reads state derived from on-chain events out of the
 * indexer's own database, so hot paths (balances, leaderboards) don't spend an RPC call per request.
 */
export function createIndexerClient(baseUrl: string): IndexerClient {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/graphql`;
  return {
    async goUsdtBalance(address) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `{ account(address: "${address.toLowerCase()}") { balance } }`,
        }),
      });
      if (!res.ok) throw new Error(`indexer responded ${res.status}`);
      const body = (await res.json()) as {
        data?: { account?: { balance: string } | null };
        errors?: unknown;
      };
      if (body.errors) throw new Error('indexer query failed');
      const balance = body.data?.account?.balance;
      return balance == null ? null : BigInt(balance);
    },
  };
}
