import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Cached match fixtures + results (filled by the credit-aware sync service). */
export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  sportKey: text('sport_key').notNull(),
  homeTeam: text('home_team').notNull(),
  awayTeam: text('away_team').notNull(),
  kickoff: integer('kickoff').notNull(),
  round: text('round').notNull().default('GROUP'),
  status: text('status').notNull().default('SCHEDULED'),
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
  // Closing h2h odds (×10_000 bps), frozen at kickoff — the reference for the on-chain boost.
  closingHomeBps: integer('closing_home_bps'),
  closingDrawBps: integer('closing_draw_bps'),
  closingAwayBps: integer('closing_away_bps'),
  updatedAt: integer('updated_at').notNull(),
});

/** User predictions. `stake` is USDT0 base units stored as a decimal string (bigint-safe). */
export const predictions = sqliteTable('predictions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  matchId: text('match_id').notNull(),
  market: text('market').notNull(),
  pick: text('pick').notNull(),
  stake: text('stake').notNull(),
  createdAt: integer('created_at').notNull(),
  settled: integer('settled', { mode: 'boolean' }).notNull().default(false),
  won: integer('won', { mode: 'boolean' }),
  payout: text('payout'),
});

/** Legal terms acceptance — one row per (account, terms version), with the EIP-712 signature as proof. */
export const termsAcceptances = sqliteTable('terms_acceptances', {
  id: text('id').primaryKey(), // `${address}-${version}`
  address: text('address').notNull(),
  version: text('version').notNull(),
  signature: text('signature').notNull(),
  acceptedAt: integer('accepted_at').notNull(),
});

/** Odds snapshot cache (optional display data), keyed by match. */
export const oddsCache = sqliteTable('odds_cache', {
  matchId: text('match_id').primaryKey(),
  market: text('market').notNull(),
  data: text('data').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
});

/** Every credit-consuming API call, for budget accounting. */
export const apiUsage = sqliteTable('api_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: integer('ts').notNull(),
  endpoint: text('endpoint').notNull(),
  cost: integer('cost').notNull(),
  remaining: integer('remaining'),
});

/** Throttle bookkeeping for the sync scheduler. */
export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  lastRunAt: integer('last_run_at').notNull().default(0),
});

/** Resolved club crest URLs, keyed by team name. `crest = ''` = looked up, none found. */
export const teamCrests = sqliteTable('team_crests', {
  name: text('name').primaryKey(),
  crest: text('crest').notNull().default(''),
  fetchedAt: integer('fetched_at').notNull(),
});
