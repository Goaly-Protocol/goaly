import type { Database } from 'bun:sqlite';

/**
 * Idempotent DDL that mirrors `schema.ts`. Kept as raw SQL so tests can spin up an
 * in-memory DB with no drizzle-kit step. Run `bun run db:generate` to produce real
 * migrations for production.
 */
export function migrate(raw: Database): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      sport_key TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      kickoff INTEGER NOT NULL,
      round TEXT NOT NULL DEFAULT 'GROUP',
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      home_score INTEGER,
      away_score INTEGER,
      closing_home_bps INTEGER,
      closing_draw_bps INTEGER,
      closing_away_bps INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      match_id TEXT NOT NULL,
      market TEXT NOT NULL,
      pick TEXT NOT NULL,
      stake TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0,
      won INTEGER,
      payout TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions (match_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions (user_id);

    CREATE TABLE IF NOT EXISTS terms_acceptances (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      version TEXT NOT NULL,
      signature TEXT NOT NULL,
      accepted_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_terms_address ON terms_acceptances (address);

    CREATE TABLE IF NOT EXISTS faucet_drips (
      address TEXT PRIMARY KEY,
      tx_hash TEXT,
      amount TEXT,
      dripped_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_faucet_dripped_at ON faucet_drips (dripped_at);

    CREATE TABLE IF NOT EXISTS odds_cache (
      match_id TEXT PRIMARY KEY,
      market TEXT NOT NULL,
      data TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      cost INTEGER NOT NULL,
      remaining INTEGER
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      last_run_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS team_crests (
      name TEXT PRIMARY KEY,
      crest TEXT NOT NULL DEFAULT '',
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id);
  `);

  // Backfill columns on pre-existing DBs (ignored when already present).
  for (const col of [
    'closing_home_bps',
    'closing_draw_bps',
    'closing_away_bps',
    'kickoff_notified_at',
  ]) {
    try {
      raw.exec(`ALTER TABLE matches ADD COLUMN ${col} INTEGER`);
    } catch {
      // column already exists
    }
  }

  // Entry odds on predictions (the "avg" price), added after launch → backfill on old DBs.
  try {
    raw.exec(`ALTER TABLE predictions ADD COLUMN entry_odds REAL`);
  } catch {
    // column already exists
  }
}
