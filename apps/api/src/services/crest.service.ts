import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { teamCrests } from '../db/schema';

const SPORTSDB_SEARCH = 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php';
const BATCH = 6; // TheSportsDB free key is rate-limited — resolve a few per tick

interface SportsDbTeam {
  strSport?: string;
  strTeamBadge?: string | null;
}

/** Brazilian state / generic suffixes that hurt name matching (e.g. "Cuiaba MT" → "Cuiaba"). */
function cleanName(name: string): string {
  const stripped = name
    .replace(/\b(MT|SP|CE|RJ|RS|PR|MG|BA|GO|PE|SC|DF)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length >= 3 ? stripped : name;
}

/**
 * Resolves + caches club crest URLs from TheSportsDB (free, no key). Best-effort: unknown clubs are
 * cached as `''` so we don't look them up again, and the UI falls back to an initials badge.
 */
export class CrestService {
  constructor(
    private readonly db: DB,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Cached crest URL for a team, or null (unknown or not-yet-resolved). */
  get(name: string): string | null {
    const row = this.db.select().from(teamCrests).where(eq(teamCrests.name, name)).get();
    return row?.crest ? row.crest : null;
  }

  /** Look up crests for the first few not-yet-cached names. Safe to call every tick. */
  async resolve(names: string[]): Promise<number> {
    const todo: string[] = [];
    const seen = new Set<string>();
    for (const name of names) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const cached = this.db.select().from(teamCrests).where(eq(teamCrests.name, name)).get();
      if (!cached) todo.push(name);
      if (todo.length >= BATCH) break;
    }
    for (const name of todo) {
      const crest = (await this.lookup(name)) ?? '';
      this.db
        .insert(teamCrests)
        .values({ name, crest, fetchedAt: this.now() })
        .onConflictDoUpdate({ target: teamCrests.name, set: { crest, fetchedAt: this.now() } })
        .run();
    }
    return todo.length;
  }

  private async lookup(name: string): Promise<string | null> {
    try {
      const res = await this.fetchFn(`${SPORTSDB_SEARCH}?t=${encodeURIComponent(cleanName(name))}`);
      if (!res.ok) return null;
      const json = (await res.json()) as { teams?: SportsDbTeam[] | null };
      const team = (json.teams ?? []).find((t) => t.strSport === 'Soccer' && t.strTeamBadge);
      return team?.strTeamBadge ?? null;
    } catch {
      return null;
    }
  }
}
