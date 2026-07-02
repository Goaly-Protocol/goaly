import { describe, expect, test } from 'bun:test';
import { type Match, assertValidResult, isOpenForPredictions } from './match';

const baseMatch: Match = {
  id: 'm1',
  homeTeam: 'Argentina',
  awayTeam: 'Brazil',
  kickoff: 1_000,
  round: 'FINAL',
  status: 'SCHEDULED',
};

describe('isOpenForPredictions', () => {
  test('open while scheduled and before kickoff', () => {
    expect(isOpenForPredictions(baseMatch, 999)).toBe(true);
  });

  test('closed at/after kickoff', () => {
    expect(isOpenForPredictions(baseMatch, 1_000)).toBe(false);
    expect(isOpenForPredictions(baseMatch, 1_001)).toBe(false);
  });

  test('closed when not scheduled', () => {
    expect(isOpenForPredictions({ ...baseMatch, status: 'LOCKED' }, 500)).toBe(false);
    expect(isOpenForPredictions({ ...baseMatch, status: 'FINISHED' }, 500)).toBe(false);
  });
});

describe('assertValidResult', () => {
  test('accepts non-negative integer scores', () => {
    expect(() => assertValidResult({ homeScore: 2, awayScore: 1 })).not.toThrow();
    expect(() => assertValidResult({ homeScore: 0, awayScore: 0 })).not.toThrow();
  });

  test('rejects negatives and non-integers', () => {
    expect(() => assertValidResult({ homeScore: -1, awayScore: 0 })).toThrow('invalid score');
    expect(() => assertValidResult({ homeScore: 1.5, awayScore: 0 })).toThrow('invalid score');
  });
});
