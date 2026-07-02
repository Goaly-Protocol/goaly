import { onchainTable } from 'ponder';

export const deposit = onchainTable('deposit', (t) => ({
  id: t.text().primaryKey(),
  user: t.hex().notNull(),
  assets: t.bigint().notNull(),
  shares: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const withdrawal = onchainTable('withdrawal', (t) => ({
  id: t.text().primaryKey(),
  user: t.hex().notNull(),
  assets: t.bigint().notNull(),
  sharesBurned: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const debtCharge = onchainTable('debt_charge', (t) => ({
  id: t.text().primaryKey(),
  user: t.hex().notNull(),
  amount: t.bigint().notNull(),
  totalDebt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

/// Aggregated per-user vault position, kept in sync with vault events.
export const account = onchainTable('account', (t) => ({
  address: t.hex().primaryKey(),
  principal: t.bigint().notNull(),
  shares: t.bigint().notNull(),
  debt: t.bigint().notNull(),
  updatedBlock: t.bigint().notNull(),
}));
