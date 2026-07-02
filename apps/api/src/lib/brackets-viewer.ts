import type { BracketRound } from './standings';

/**
 * Transform Goaly's knockout rounds into the data model consumed by brackets-viewer.js
 * (https://github.com/Drarig29/brackets-model): a single-elimination stage the client renders as a
 * real bracket. Pure — the route supplies a `codeOf` resolver for team display names.
 */

type Result = 'win' | 'loss' | 'draw';

interface ParticipantResult {
  id: number | null;
  score?: number;
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
}

// brackets-model Status enum.
const STATUS_WAITING = 1;
const STATUS_READY = 2;
const STATUS_COMPLETED = 4;

export function toBracketsViewer(
  rounds: BracketRound[],
  codeOf: (team: string) => string,
): BracketsViewerData {
  // The third-place play-off is not part of the elimination tree — drop it from the bracket.
  const koRounds = rounds.filter((r) => !/third/i.test(r.name));

  const nameToId = new Map<string, number>();
  const participants: BracketsViewerData['participants'] = [];
  const participantId = (team: string): number | null => {
    if (!team) return null;
    const existing = nameToId.get(team);
    if (existing !== undefined) return existing;
    const id = participants.length;
    nameToId.set(team, id);
    participants.push({ id, tournament_id: 0, name: codeOf(team) });
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
        win: boolean,
      ): ParticipantResult | null => {
        if (id === null) return { id: null };
        const result: ParticipantResult = { id };
        if (played) {
          if (score !== null) result.score = score;
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
        opponent1: opponent(p1, hs, homeWin),
        opponent2: opponent(p2, as, played && !homeWin),
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
  };
}
