import type { Match, MatchResult } from '@goalyield/core';
import type { OddsEntry, ProviderResult, ScoreEntry, SportsDataProvider } from './types';

/** Deterministic in-memory provider for local dev and tests (zero credits). */
export class MockSportsProvider implements SportsDataProvider {
  readonly name = 'mock';
  private fixtures: Match[];
  private readonly results = new Map<string, MatchResult>();

  constructor(fixtures: Match[] = []) {
    this.fixtures = fixtures;
  }

  setFixtures(fixtures: Match[]): void {
    this.fixtures = fixtures;
  }

  setResult(matchId: string, result: MatchResult): void {
    this.results.set(matchId, result);
  }

  async listEvents(): Promise<ProviderResult<Match[]>> {
    return { data: this.fixtures };
  }

  async listScores(): Promise<ProviderResult<ScoreEntry[]>> {
    const data: ScoreEntry[] = [...this.results.entries()].map(([matchId, result]) => ({
      matchId,
      result,
      completed: true,
    }));
    return { data };
  }

  async listOdds(): Promise<ProviderResult<OddsEntry[]>> {
    return { data: [] };
  }
}
