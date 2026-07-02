import { Database } from 'bun:sqlite';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from './migrate';
import * as schema from './schema';

export type DB = BunSQLiteDatabase<typeof schema>;

export interface DbHandle {
  db: DB;
  raw: Database;
}

/** Create a Drizzle DB. Pass ':memory:' for tests. Schema is applied idempotently. */
export function createDb(url: string): DbHandle {
  const raw = new Database(url);
  if (url !== ':memory:') {
    raw.exec('PRAGMA journal_mode = WAL;');
  }
  raw.exec('PRAGMA foreign_keys = ON;');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return { db, raw };
}

export { schema };
