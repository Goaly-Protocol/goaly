import { computeStandings, type FifaMatch, type StandingGroup } from '../lib/standings';

/**
 * FIFA World Cup 2026 (Canada/Mexico/USA) — public FIFA data API.
 *  - competition 17 = FIFA World Cup (men's), season 285023 = 2026
 *  - stage 289273    = group stage (72 fixtures across 12 groups)
 * The `from` filter jumps past older editions the endpoint returns first.
 */
const FIFA_MATCHES_URL =
  'https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=200&from=2026-06-01T00:00:00Z&language=en';
const GROUP_STAGE_ID = '289273';
const TTL_MS = 10 * 60 * 1000; // standings move slowly — cache 10 min, be polite to FIFA.

/** Fetches FIFA group-stage results and computes cached group tables. Free (no odds credits). */
export class StandingsService {
  private cache: { at: number; data: StandingGroup[] } | null = null;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<StandingGroup[]> {
    const now = this.now();
    if (this.cache && now - this.cache.at < TTL_MS) return this.cache.data;
    try {
      const res = await this.fetchFn(FIFA_MATCHES_URL, {
        headers: { 'User-Agent': 'Goaly/1.0', Accept: 'application/json' },
      });
      if (!res.ok) return this.cache?.data ?? [];
      const json = (await res.json()) as { Results?: FifaMatch[] };
      const data = computeStandings(json.Results ?? [], GROUP_STAGE_ID);
      this.cache = { at: now, data };
      return data;
    } catch {
      return this.cache?.data ?? []; // network hiccup → serve last good (or empty)
    }
  }
}
