import type { Match, MatchResult } from '@goaly/core';

/** Quota telemetry parsed from The Odds API response headers. */
export interface QuotaInfo {
  remaining: number | null;
  used: number | null;
  lastCost: number | null;
}

export interface ProviderResult<T> {
  data: T;
  quota?: QuotaInfo;
}

export interface ScoreEntry {
  matchId: string;
  result: MatchResult;
  completed: boolean;
}

export interface OddsEntry {
  matchId: string;
  market: string;
  data: unknown;
}

/**
 * Abstracts a sports-data source. The MVP ships a mock; The Odds API is the real
 * adapter. Credit costs (The Odds API v4):
 *  - listEvents  → 0 credits (free)
 *  - listScores  → 1 credit (2 with daysFrom)
 *  - listOdds    → markets × regions credits
 */
export interface SportsDataProvider {
  readonly name: string;
  listEvents(sportKey: string): Promise<ProviderResult<Match[]>>;
  listScores(
    sportKey: string,
    opts?: { daysFrom?: 1 | 2 | 3 },
  ): Promise<ProviderResult<ScoreEntry[]>>;
  listOdds(
    sportKey: string,
    opts: { regions: string; markets: string },
  ): Promise<ProviderResult<OddsEntry[]>>;
}
