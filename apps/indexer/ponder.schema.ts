import { onchainTable } from 'ponder';

/// One row per `Predicted(marketId, user, outcome, stake)` — a stake placed on a match outcome.
/// `outcome` is the GoalyMarkets `Outcome` enum: 0 = HOME, 1 = DRAW, 2 = AWAY.
export const prediction = onchainTable('prediction', (t) => ({
  id: t.text().primaryKey(), // `${tx.hash}-${log.logIndex}`
  marketId: t.hex().notNull(),
  user: t.hex().notNull(),
  outcome: t.integer().notNull(),
  stake: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

/// One row per `Claimed(marketId, user, stakeReturned, prize)` — principal reclaimed (+ prize if won).
export const claim = onchainTable('claim', (t) => ({
  id: t.text().primaryKey(), // `${tx.hash}-${log.logIndex}`
  marketId: t.hex().notNull(),
  user: t.hex().notNull(),
  stakeReturned: t.bigint().notNull(),
  prize: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

/// Aggregated per-market lifecycle, kept in sync with `MarketCreated` / `MarketSettled`.
/// `result` is the winning `Outcome` enum (0/1/2), only meaningful once `status === 'SETTLED'`.
export const market = onchainTable('market', (t) => ({
  id: t.hex().primaryKey(), // marketId
  status: t.text().notNull(), // 'OPEN' | 'SETTLED'
  closeTime: t.bigint().notNull(),
  result: t.integer(),
  winningStake: t.bigint(),
  prize: t.bigint(),
  createdBlock: t.bigint().notNull(),
  settledBlock: t.bigint(),
  updatedTimestamp: t.bigint().notNull(),
}));

/// Aggregated per-user activity, powering positions / leaderboard views.
export const user = onchainTable('user', (t) => ({
  address: t.hex().primaryKey(),
  totalStaked: t.bigint().notNull(),
  totalPrize: t.bigint().notNull(),
  predictionCount: t.integer().notNull(),
  claimCount: t.integer().notNull(),
  updatedBlock: t.bigint().notNull(),
}));
