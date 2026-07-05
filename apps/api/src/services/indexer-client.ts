/**
 * Thin, dependency-light client for the Ponder indexer's GraphQL API
 * (`${INDEXER_URL}/graphql`). Ponder exposes a plural query field per table that
 * returns `{ items { ... } }`, ordered via `orderBy` (field name) + `orderDirection`
 * ("asc" | "desc") and filtered via `where`. BigInt columns are serialised as
 * decimal strings; integer columns as numbers.
 *
 * Schema (apps/indexer/ponder.schema.ts):
 *  - user:       address, totalStaked, totalPrize, predictionCount, claimCount, updatedBlock
 *  - market:     id, status, closeTime, result, winningStake, prize, createdBlock, settledBlock, updatedTimestamp
 *  - prediction: id, marketId, user, outcome, stake, blockNumber, timestamp
 *  - claim:      id, marketId, user, stakeReturned, prize, blockNumber, timestamp
 */

const REQUEST_TIMEOUT_MS = 8_000;
const OUTCOMES = ['HOME', 'DRAW', 'AWAY'] as const;

/** Per-user aggregate row from the indexer's `user` table. */
export interface IndexerUser {
  address: string;
  totalStaked: string;
  totalPrize: string;
  predictionCount: number;
  claimCount: number;
}

/** A clean leaderboard entry. Base-unit amounts are decimal strings; counts are numbers. */
export interface LeaderboardEntry {
  address: string;
  predictions: number;
  totalStaked: string;
  wins: number;
  /** Total value transacted = staked principal + prizes won (base units). */
  volume: string;
}

/** Per-market lifecycle row from the indexer's `market` table. */
export interface IndexerMarket {
  id: string;
  status: string;
  closeTime: string;
  result: number | null;
  /** 'HOME' | 'DRAW' | 'AWAY' once settled, else null. */
  resultLabel: string | null;
  winningStake: string | null;
  prize: string | null;
  createdBlock: string;
  settledBlock: string | null;
  updatedTimestamp: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

interface Page<T> {
  items: T[];
}

/**
 * POST a GraphQL query to the indexer and return `data`. Throws on network error,
 * timeout (8s), non-200, or GraphQL-level errors — callers decide whether to fall back.
 */
export async function queryIndexer<T>(
  indexerUrl: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const endpoint = `${indexerUrl.replace(/\/+$/, '')}/graphql`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`indexer responded ${res.status}`);
    const body = (await res.json()) as GraphQLResponse<T>;
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
    if (!body.data) throw new Error('indexer returned no data');
    return body.data;
  } finally {
    clearTimeout(timeout);
  }
}

const LEADERBOARD_QUERY = /* GraphQL */ `
  query Leaderboard($limit: Int!) {
    users(orderBy: "totalStaked", orderDirection: "desc", limit: $limit) {
      items {
        address
        totalStaked
        totalPrize
        predictionCount
        claimCount
      }
    }
  }
`;

/**
 * Top stakers, highest `totalStaked` first. `wins` uses `claimCount` (settled positions the
 * user has claimed); `volume` is `totalStaked + totalPrize` (total value transacted).
 */
export async function fetchLeaderboard(
  indexerUrl: string,
  limit: number,
): Promise<LeaderboardEntry[]> {
  const data = await queryIndexer<{ users: Page<IndexerUser> }>(indexerUrl, LEADERBOARD_QUERY, {
    limit,
  });
  return data.users.items.map((u) => ({
    address: u.address,
    predictions: u.predictionCount,
    totalStaked: u.totalStaked,
    wins: u.claimCount,
    volume: (BigInt(u.totalStaked) + BigInt(u.totalPrize)).toString(),
  }));
}

const MARKETS_QUERY = /* GraphQL */ `
  query Markets($limit: Int!) {
    markets(orderBy: "updatedTimestamp", orderDirection: "desc", limit: $limit) {
      items {
        id
        status
        closeTime
        result
        winningStake
        prize
        createdBlock
        settledBlock
        updatedTimestamp
      }
    }
  }
`;

interface RawMarket {
  id: string;
  status: string;
  closeTime: string;
  result: number | null;
  winningStake: string | null;
  prize: string | null;
  createdBlock: string;
  settledBlock: string | null;
  updatedTimestamp: string;
}

/** On-chain markets, most recently updated first. */
export async function fetchMarkets(indexerUrl: string, limit: number): Promise<IndexerMarket[]> {
  const data = await queryIndexer<{ markets: Page<RawMarket> }>(indexerUrl, MARKETS_QUERY, {
    limit,
  });
  return data.markets.items.map((m) => ({
    ...m,
    resultLabel: m.result === null ? null : (OUTCOMES[m.result] ?? null),
  }));
}
