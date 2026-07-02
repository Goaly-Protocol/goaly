/** A football match and its lifecycle. */

export type MatchStatus = 'SCHEDULED' | 'LOCKED' | 'FINISHED' | 'CANCELLED';

export interface MatchResult {
  homeScore: number;
  awayScore: number;
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  /** Kickoff time, unix seconds. Predictions lock at kickoff. */
  kickoff: number;
  /** Bracket round, e.g. "R16", "QF", "SF", "FINAL". */
  round: string;
  status: MatchStatus;
  result?: MatchResult;
}

/** Predictions are accepted only while scheduled and before kickoff. */
export function isOpenForPredictions(match: Match, nowSeconds: number): boolean {
  return match.status === 'SCHEDULED' && nowSeconds < match.kickoff;
}

/** Validate a result: non-negative integer scores. */
export function assertValidResult(result: MatchResult): void {
  const { homeScore, awayScore } = result;
  if (
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    throw new Error(`assertValidResult: invalid score ${homeScore}-${awayScore}`);
  }
}
