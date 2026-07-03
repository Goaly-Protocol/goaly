import type { Match, MatchResult } from '@goaly/core';
import type { OddsEntry, ProviderResult, ScoreEntry, SportsDataProvider } from './types';

/**
 * Provider for the Goaly Odds feed (https://odds.goaly.fun) — a single public JSON board of live +
 * upcoming soccer with Asian Handicap + Over/Under (Malay odds). No auth, no credits. Since Goaly's
 * markets are 1X2 (home/draw/away), we derive fair 1X2 decimal odds from the AH + O/U lines with a
 * Poisson goals model, and expose them in the same h2h/bookmakers shape the rest of the app parses.
 */

interface GoalyOddsBlock {
  handicap?: { line: number; home: number | null; away: number | null };
  overunder?: { line: number; over: number | null; under: number | null };
}
interface GoalyMatch {
  league: string;
  home: string;
  away: string;
  kickoff: string;
  score: string | null;
  time: string;
  isgive: number;
  category?: string;
  oddsid: number;
  fulltime?: GoalyOddsBlock;
  firsthalf?: GoalyOddsBlock;
}
interface GoalyBoard {
  updated_at: string;
  sport: string;
  total: number;
  matches: GoalyMatch[];
}

const SITE_TZ_OFFSET_S = 7 * 3600; // kickoff strings are the site's wall time (~UTC+7)
/** Matches stay bettable from now until this long after kickoff (covers the live match);
 *  past it they're treated as finished. Also the on-chain market close window. */
export const LIVE_MATCH_WINDOW_S = 150 * 60; // 2.5 h
const SKIP_LEAGUE = /E-?FOOTBALL|ESPORT|FANTASY|VIRTUAL|SIMULAT|CYBER|SRL/i;
const MAX_MATCHES = 60; // show the whole board; on-chain markets are created best-effort
const CACHE_TTL_MS = 4000; // the feed moves every few seconds; one fetch serves a sync tick

/** Malay odds → decimal. `+0.90`→1.90, `-0.90`→2.11, `0`→2.00. */
export function malayToDecimal(price: number | null | undefined): number | null {
  if (price === null || price === undefined) return null;
  if (price === 0) return 2;
  return price > 0 ? price + 1 : 1 + 1 / Math.abs(price);
}

/** "YYYY-MM-DD HH:MM:SS" (site tz ~UTC+7) → unix seconds. */
export function parseKickoff(value: string): number {
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  const utc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  return Math.floor(utc / 1000) - SITE_TZ_OFFSET_S;
}

/** "1 - 0" / "1 - 0 HT" → { homeScore, awayScore }, or null when absent. */
export function parseScore(value: string | null | undefined): MatchResult | null {
  if (!value) return null;
  const m = value.match(/(\d+)\s*-\s*(\d+)/);
  return m ? { homeScore: Number(m[1]), awayScore: Number(m[2]) } : null;
}

/** A live clock ("2H 47'", "HT", "1H") means the match is in progress. */
export function isLive(time: string | undefined): boolean {
  return /\dH|HT|'/i.test(time ?? '');
}

const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
function poisson(k: number, lambda: number): number {
  return (Math.exp(-lambda) * lambda ** k) / FACTORIAL[k]!;
}

/**
 * Derive 1X2 decimal odds from an Asian Handicap + Over/Under block. The handicap line gives the
 * expected supremacy (goal difference) and the O/U line the expected total; a Poisson model over
 * both teams' expected goals yields P(home)/P(draw)/P(away) → fair decimal odds. Null if no O/U.
 */
export function deriveH2h(
  block: GoalyOddsBlock | undefined,
  isgive: number,
): { home: number; draw: number; away: number } | null {
  const total = block?.overunder?.line ?? 0;
  const hcLine = block?.handicap?.line ?? 0;
  if (!(total > 0)) return null;

  const supremacy = isgive === 1 ? hcLine : -hcLine;
  const homeXg = Math.max(0.05, (total + supremacy) / 2);
  const awayXg = Math.max(0.05, (total - supremacy) / 2);

  const MAX = 10;
  const hp = Array.from({ length: MAX + 1 }, (_, i) => poisson(i, homeXg));
  const ap = Array.from({ length: MAX + 1 }, (_, j) => poisson(j, awayXg));
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  for (let i = 0; i <= MAX; i++) {
    for (let j = 0; j <= MAX; j++) {
      const p = hp[i]! * ap[j]!;
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
    }
  }
  const sum = pHome + pDraw + pAway;
  if (sum <= 0) return null;
  return { home: sum / pHome, draw: sum / pDraw, away: sum / pAway };
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 48);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 14);

/**
 * Stable match id from teams + kickoff — NOT `oddsid`, which the feed regenerates over time and
 * would otherwise create duplicate matches/markets for the same fixture on re-sync.
 */
function matchId(m: GoalyMatch): string {
  return `g-${slug(m.home)}-${slug(m.away)}-${parseKickoff(m.kickoff)}`;
}

export class GoalyOddsProvider implements SportsDataProvider {
  readonly name = 'goaly-odds';
  private cache: { at: number; board: GoalyBoard } | null = null;

  constructor(
    private readonly url = 'https://odds.goaly.fun',
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async board(): Promise<GoalyBoard> {
    const now = this.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.board;
    const res = await this.fetchFn(this.url, { headers: { Accept: 'application/json' } });
    const board = (await res.json()) as GoalyBoard;
    this.cache = { at: now, board };
    return board;
  }

  /** Bettable = upcoming OR live (within the live window after kickoff); finished (past it) drops
   *  out. The feed can't tell live from finished, so we use kickoff + window. Deduped by stable id. */
  private kept(board: GoalyBoard): GoalyMatch[] {
    const nowS = Math.floor(this.now() / 1000);
    const seen = new Set<string>();
    const out: GoalyMatch[] = [];
    for (const m of board.matches) {
      const usable =
        m.home &&
        m.away &&
        parseKickoff(m.kickoff) + LIVE_MATCH_WINDOW_S > nowS &&
        !SKIP_LEAGUE.test(m.league) &&
        (m.fulltime?.overunder?.line ?? 0) > 0;
      if (!usable) continue;
      const id = matchId(m);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(m);
      if (out.length >= MAX_MATCHES) break;
    }
    return out;
  }

  async listEvents(): Promise<ProviderResult<Match[]>> {
    const board = await this.board();
    const data: Match[] = this.kept(board).map((m) => ({
      id: matchId(m),
      homeTeam: m.home,
      awayTeam: m.away,
      kickoff: parseKickoff(m.kickoff),
      round: titleCase(m.league),
      status: 'SCHEDULED',
    }));
    return { data };
  }

  async listScores(): Promise<ProviderResult<ScoreEntry[]>> {
    const board = await this.board();
    const data: ScoreEntry[] = [];
    for (const m of board.matches) {
      const result = parseScore(m.score);
      if (!result) continue;
      data.push({ matchId: matchId(m), result, completed: !isLive(m.time) });
    }
    return { data };
  }

  async listOdds(): Promise<ProviderResult<OddsEntry[]>> {
    const board = await this.board();
    const data: OddsEntry[] = [];
    for (const m of this.kept(board)) {
      const h2h = deriveH2h(m.fulltime, m.isgive);
      if (!h2h) continue;
      data.push({
        matchId: matchId(m),
        market: 'h2h',
        data: [
          {
            markets: [
              {
                key: 'h2h',
                outcomes: [
                  { name: m.home, price: round2(h2h.home) },
                  { name: m.away, price: round2(h2h.away) },
                  { name: 'Draw', price: round2(h2h.draw) },
                ],
              },
            ],
          },
        ],
      });
    }
    return { data };
  }
}
