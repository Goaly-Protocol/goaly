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
  `);
}
