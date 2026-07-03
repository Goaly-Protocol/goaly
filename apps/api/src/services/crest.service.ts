import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { teamCrests } from '../db/schema';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'GoalyBot/1.0 (https://goaly.fun)';
const BATCH = 6; // resolve a few per tick — be polite to the public APIs

// Crests are vector/PNG; reject .jpg lead images (usually player/stadium photos, not badges).
const IS_CREST = /\.(svg|png)$/i;

/**
 * Resolves + caches club crest URLs from Wikimedia (free, no key). Primary source is Wikidata's
 * "logo image" (P154) — the official crest; fallback is the Wikipedia page's lead image, filtered to
 * SVG/PNG so we don't grab a photo. Misses are cached as `''`; the UI falls back to a colour badge.
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
    return (await this.wikidataLogo(name)) ?? (await this.wikipediaImage(name));
  }

  /** Wikidata P154 ("logo image") → a Commons file, served (and rasterised) via Special:FilePath. */
  private async wikidataLogo(name: string): Promise<string | null> {
    const search = await this.getJson(
      `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&format=json&limit=1&origin=*`,
    );
    const id = search?.search?.[0]?.id;
    if (typeof id !== 'string') return null;
    const claims = await this.getJson(
      `${WIKIDATA_API}?action=wbgetclaims&entity=${id}&property=P154&format=json&origin=*`,
    );
    const file = claims?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
    if (typeof file !== 'string' || !file) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=200`;
  }

  /** Wikipedia page lead image for the best search hit, kept only if it looks like a crest. */
  private async wikipediaImage(name: string): Promise<string | null> {
    const json = await this.getJson(
      `${WIKIPEDIA_API}?action=query&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrlimit=1&prop=pageimages&piprop=original|thumbnail&pithumbsize=256&format=json&redirects=1&origin=*`,
    );
    const pages = json?.query?.pages;
    if (!pages || typeof pages !== 'object') return null;
    for (const page of Object.values(pages) as Array<Record<string, unknown>>) {
      const original = (page.original as { source?: string } | undefined)?.source;
      const thumb = (page.thumbnail as { source?: string } | undefined)?.source;
      const url = original ?? thumb;
      if (url && IS_CREST.test(new URL(url).pathname)) return url;
    }
    return null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: external API JSON is navigated defensively
  private async getJson(url: string): Promise<any> {
    try {
      const res = await this.fetchFn(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}
