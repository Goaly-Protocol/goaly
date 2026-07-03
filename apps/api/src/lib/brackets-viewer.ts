import type { BracketRound } from './standings';

/**
 * Transform Goaly's knockout rounds into the data model consumed by brackets-viewer.js
 * (https://github.com/Drarig29/brackets-model): a single-elimination stage the client renders as a
 * real bracket. Pure — the route supplies a `codeOf` resolver for team display names.
 */

type Result = 'win' | 'loss' | 'draw';

interface ParticipantResult {
  id: number | null;
  // Number, or "1 (4)" when decided on penalties — brackets-viewer .toString()s it.
  score?: number | string;
  result?: Result;
}

export interface BracketsViewerData {
  stages: Array<{
    id: number;
    tournament_id: number;
    name: string;
    type: 'single_elimination';
    number: number;
    settings: { size?: number; seedOrdering?: string[] };
  }>;
  matches: Array<{
    id: number;
    stage_id: number;
    group_id: number;
    round_id: number;
    number: number;
    child_count: number;
    status: number;
    opponent1: ParticipantResult | null;
    opponent2: ParticipantResult | null;
  }>;
  matchGames: [];
  participants: Array<{ id: number; tournament_id: number; name: string }>;
  participantImages: Array<{ participantId: number; imageUrl: string }>;
}

/** Display name + optional flag for a team. */
export interface TeamDisplay {
  name: string;
  imageUrl: string | null;
}

// brackets-model Status enum.
const STATUS_WAITING = 1;
const STATUS_READY = 2;
const STATUS_COMPLETED = 4;

type KoMatch = BracketRound['matches'][number];

/** The team that advances from a tie (goals, then penalties). Null if not played. */
function advancer(m: KoMatch): string | null {
  const hs = m.homeScore;
  const as = m.awayScore;
  if (hs === null || as === null || !m.home || !m.away) return null;
  if (hs !== as) return hs > as ? m.home : m.away;
  return (m.homePens ?? 0) >= (m.awayPens ?? 0) ? m.home : m.away;
}

/**
 * Reorder each round so consecutive pairs feed the next round's matches — the binary-tree shape
 * brackets-viewer draws its connectors from. The feed lists ties in date order, not bracket order,
 * so without this the connectors point at the wrong teams. Matches winner→next-round-team; where the
 * next round is still TBD, the original order is kept.
 */
function alignRounds(rounds: BracketRound[]): BracketRound[] {
  const out = rounds.map((r) => ({ ...r, matches: [...r.matches] }));
  for (let r = 0; r < out.length - 1; r += 1) {
    const cur = out[r];
    const next = out[r + 1];
    if (!cur || !next || cur.matches.length !== next.matches.length * 2) continue;

    const byWinner = new Map<string, KoMatch>();
    for (const m of cur.matches) {
      const w = advancer(m);
      if (w) byWinner.set(w, m);
    }

    const used = new Set<KoMatch>();
    const ordered: (KoMatch | null)[] = [];
    for (const nm of next.matches) {
      for (const team of [nm.home, nm.away]) {
        const feeder = team ? byWinner.get(team) : undefined;
        if (feeder && !used.has(feeder)) {
          ordered.push(feeder);
          used.add(feeder);
        } else {
          ordered.push(null);
        }
      }
    }
    const leftovers = cur.matches.filter((m) => !used.has(m));
    let li = 0;
    const filled = ordered
      .map((slot) => slot ?? leftovers[li++])
      .filter((m): m is KoMatch => Boolean(m));
    if (filled.length === cur.matches.length) cur.matches = filled;
  }
  return out;
}

export function toBracketsViewer(
  rounds: BracketRound[],
  resolve: (team: string) => TeamDisplay,
): BracketsViewerData {
  // Third-place play-off isn't part of the tree; align the rest so connectors match the teams.
  const koRounds = alignRounds(rounds.filter((r) => !/third/i.test(r.name)));

  const nameToId = new Map<string, number>();
  const participants: BracketsViewerData['participants'] = [];
  const participantImages: BracketsViewerData['participantImages'] = [];
  const participantId = (team: string): number | null => {
    if (!team) return null;
    const existing = nameToId.get(team);
    if (existing !== undefined) return existing;
    const id = participants.length;
    nameToId.set(team, id);
    const display = resolve(team);
    participants.push({ id, tournament_id: 0, name: display.name });
    if (display.imageUrl) participantImages.push({ participantId: id, imageUrl: display.imageUrl });
    return id;
  };

  const matches: BracketsViewerData['matches'] = [];
  let matchId = 0;
  koRounds.forEach((round, roundIdx) => {
    round.matches.forEach((m, i) => {
      const p1 = participantId(m.home);
      const p2 = participantId(m.away);
      const hs = m.homeScore;
      const as = m.awayScore;
      const played = hs !== null && as !== null;
      const homeWin =
        hs !== null &&
        as !== null &&
        (hs > as || (hs === as && (m.homePens ?? 0) > (m.awayPens ?? 0)));

      const opponent = (
        id: number | null,
        score: number | null,
        pens: number | null,
        win: boolean,
      ): ParticipantResult | null => {
        if (id === null) return { id: null };
        const result: ParticipantResult = { id };
        if (played) {
          // "(4) 1" — penalties in parens BEFORE goals, so the goal score stays right-aligned
          // with non-shootout matches.
          if (score !== null) result.score = pens !== null ? `(${pens}) ${score}` : score;
          result.result = win ? 'win' : 'loss';
        }
        return result;
      };

      matches.push({
        id: matchId++,
        stage_id: 0,
        group_id: 0,
        round_id: roundIdx,
        number: i + 1,
        child_count: 0,
        status: played
          ? STATUS_COMPLETED
          : p1 !== null && p2 !== null
            ? STATUS_READY
            : STATUS_WAITING,
        opponent1: opponent(p1, hs, m.homePens, homeWin),
        opponent2: opponent(p2, as, m.awayPens, played && !homeWin),
      });
    });
  });

  return {
    stages: [
      {
        id: 0,
        tournament_id: 0,
        name: 'Knockout',
        type: 'single_elimination',
        number: 1,
        settings: { size: (koRounds[0]?.matches.length ?? 16) * 2, seedOrdering: ['natural'] },
      },
    ],
    matches,
    matchGames: [],
    participants,
    participantImages,
  };
}
