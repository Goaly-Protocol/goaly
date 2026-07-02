/** One team's row in a group table. */
export interface StandingRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

/** A group with its ranked table. */
export interface StandingGroup {
  id: string;
  name: string;
  rows: StandingRow[];
}

interface FifaTeam {
  TeamName?: Array<{ Description?: string }>;
  Abbreviation?: string;
}

/** Subset of a FIFA `/calendar/matches` result we use to build standings + bracket. */
export interface FifaMatch {
  IdStage?: string;
  IdGroup?: string;
  GroupName?: Array<{ Description?: string }>;
  Home?: FifaTeam | null;
  Away?: FifaTeam | null;
  HomeTeamScore?: number | null;
  AwayTeamScore?: number | null;
  HomeTeamPenaltyScore?: number | null;
  AwayTeamPenaltyScore?: number | null;
}

function desc(arr?: Array<{ Description?: string }>): string {
  return arr?.[0]?.Description ?? '';
}

function blankRow(team: string): StandingRow {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

/**
 * Build group tables from FIFA group-stage match results. Only matches in `groupStageId` with both
 * teams named are counted; only played matches (numeric scores) affect points. 3-1-0 scoring,
 * ranked by points → GD → GF → name.
 */
export function computeStandings(matches: FifaMatch[], groupStageId: string): StandingGroup[] {
  const groups = new Map<string, { name: string; rows: Map<string, StandingRow> }>();

  for (const m of matches) {
    if (m.IdStage !== groupStageId || !m.IdGroup) continue;
    const home = desc(m.Home?.TeamName ?? undefined);
    const away = desc(m.Away?.TeamName ?? undefined);
    if (!home || !away) continue;

    let group = groups.get(m.IdGroup);
    if (!group) {
      group = { name: desc(m.GroupName) || 'Group', rows: new Map() };
      groups.set(m.IdGroup, group);
    }
    const hr = group.rows.get(home) ?? blankRow(home);
    const ar = group.rows.get(away) ?? blankRow(away);
    group.rows.set(home, hr);
    group.rows.set(away, ar);

    const hs = m.HomeTeamScore;
    const as = m.AwayTeamScore;
    if (typeof hs !== 'number' || typeof as !== 'number') continue; // fixture not played yet

    hr.played += 1;
    ar.played += 1;
    hr.gf += hs;
    hr.ga += as;
    ar.gf += as;
    ar.ga += hs;
    hr.gd = hr.gf - hr.ga;
    ar.gd = ar.gf - ar.ga;
    if (hs > as) {
      hr.won += 1;
      hr.points += 3;
      ar.lost += 1;
    } else if (hs < as) {
      ar.won += 1;
      ar.points += 3;
      hr.lost += 1;
    } else {
      hr.drawn += 1;
      ar.drawn += 1;
      hr.points += 1;
      ar.points += 1;
    }
  }

  return [...groups.entries()]
    .map(([id, group]) => ({
      id,
      name: group.name,
      rows: [...group.rows.values()].sort(
        (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One knockout tie (team names, may be empty when the bracket slot is still TBD). */
export interface BracketMatch {
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  homePens: number | null;
  awayPens: number | null;
}

/** A knockout round with its ties. */
export interface BracketRound {
  id: string;
  name: string;
  matches: BracketMatch[];
}

/** FIFA World Cup 2026 knockout stage IDs, in bracket order. */
const KNOCKOUT_ROUNDS = [
  { id: '289287', name: 'Round of 32' },
  { id: '289288', name: 'Round of 16' },
  { id: '289289', name: 'Quarter-finals' },
  { id: '289290', name: 'Semi-finals' },
  { id: '289291', name: 'Third place' },
  { id: '289292', name: 'Final' },
] as const;

function score(n: number | null | undefined): number | null {
  return typeof n === 'number' ? n : null;
}

/** Group knockout fixtures into rounds (R32 → Final). Rounds with no fixtures are omitted. */
export function computeBracket(matches: FifaMatch[]): BracketRound[] {
  return KNOCKOUT_ROUNDS.map((round) => ({
    id: round.id,
    name: round.name,
    matches: matches
      .filter((m) => m.IdStage === round.id)
      .map((m) => ({
        home: desc(m.Home?.TeamName ?? undefined),
        away: desc(m.Away?.TeamName ?? undefined),
        homeScore: score(m.HomeTeamScore),
        awayScore: score(m.AwayTeamScore),
        homePens: score(m.HomeTeamPenaltyScore),
        awayPens: score(m.AwayTeamPenaltyScore),
      })),
  })).filter((round) => round.matches.length > 0);
}
