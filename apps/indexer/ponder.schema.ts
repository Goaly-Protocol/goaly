import { onchainTable } from 'ponder';

export const deposit = onchainTable('deposit', (t) => ({
  id: t.text().primaryKey(),
  receiver: t.hex().notNull(),
  assets: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const withdrawal = onchainTable('withdrawal', (t) => ({
  id: t.text().primaryKey(),
  owner: t.hex().notNull(),
  receiver: t.hex().notNull(),
  assets: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

/// Aggregated per-user goUSDT balance (= redeemable USDT0 principal), kept in sync with events.
export const account = onchainTable('account', (t) => ({
  address: t.hex().primaryKey(),
  balance: t.bigint().notNull(),
  updatedBlock: t.bigint().notNull(),
}));
