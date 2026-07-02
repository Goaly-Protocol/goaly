/** Prediction markets and grading. */

import { assertValidResult, type MatchResult } from './match';

export type Outcome = 'HOME' | 'DRAW' | 'AWAY';
export type MarketType = 'WINNER' | 'EXACT_SCORE';

/** A discriminated pick per market type. */
export type Pick =
  | { market: 'WINNER'; outcome: Outcome }
  | { market: 'EXACT_SCORE'; homeScore: number; awayScore: number };

export interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  pick: Pick;
  /** Credit staked on this prediction, in base units. */
  stake: bigint;
}

/** The 1X2 outcome implied by a final score. */
export function resolveOutcome(result: MatchResult): Outcome {
  assertValidResult(result);
  if (result.homeScore > result.awayScore) return 'HOME';
  if (result.homeScore < result.awayScore) return 'AWAY';
  return 'DRAW';
}

/** Whether a pick is correct against the final result. */
export function isPredictionCorrect(pick: Pick, result: MatchResult): boolean {
  assertValidResult(result);
  switch (pick.market) {
    case 'WINNER':
      return pick.outcome === resolveOutcome(result);
    case 'EXACT_SCORE':
      return pick.homeScore === result.homeScore && pick.awayScore === result.awayScore;
  }
}
