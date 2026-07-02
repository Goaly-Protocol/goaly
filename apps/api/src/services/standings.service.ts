import {
  type BracketRound,
  computeBracket,
  computeStandings,
  type FifaMatch,
  type StandingGroup,
} from '../lib/standings';

/**
 * FIFA World Cup 2026 (Canada/Mexico/USA) — public FIFA data API.
 *  - competition 17 = FIFA World Cup (men's), season 285023 = 2026
 *  - stage 289273    = group stage (72 fixtures across 12 groups); 289287+ = knockouts
 * The `from` filter jumps past older editions the endpoint returns first.
 */
const FIFA_MATCHES_URL =
  'https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=200&from=2026-06-01T00:00:00Z&language=en';
const GROUP_STAGE_ID = '289273';
const TTL_MS = 10 * 60 * 1000; // the tournament moves slowly — cache 10 min, be polite to FIFA.

/** Fetches FIFA fixtures once (cached) and derives group tables + the knockout bracket. */
export class StandingsService {
  private cache: { at: number; matches: FifaMatch[] } | null = null;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async matches(): Promise<FifaMatch[]> {
    const now = this.now();
    if (this.cache && now - this.cache.at < TTL_MS) return this.cache.matches;
    try {
      const res = await this.fetchFn(FIFA_MATCHES_URL, {
        headers: { 'User-Agent': 'Goaly/1.0', Accept: 'application/json' },
      });
      if (!res.ok) return this.cache?.matches ?? [];
      const json = (await res.json()) as { Results?: FifaMatch[] };
      const matches = json.Results ?? [];
      this.cache = { at: now, matches };
      return matches;
    } catch {
      return this.cache?.matches ?? []; // network hiccup → serve last good (or empty)
    }
  }

  async get(): Promise<StandingGroup[]> {
    return computeStandings(await this.matches(), GROUP_STAGE_ID);
  }

  async bracket(): Promise<BracketRound[]> {
    return computeBracket(await this.matches());
  }
}
