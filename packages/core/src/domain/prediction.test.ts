import { describe, expect, test } from 'bun:test';
import { type Pick, isPredictionCorrect, resolveOutcome } from './prediction';

describe('resolveOutcome', () => {
  test('maps scores to 1X2', () => {
    expect(resolveOutcome({ homeScore: 2, awayScore: 1 })).toBe('HOME');
    expect(resolveOutcome({ homeScore: 0, awayScore: 0 })).toBe('DRAW');
    expect(resolveOutcome({ homeScore: 1, awayScore: 3 })).toBe('AWAY');
  });
});

describe('isPredictionCorrect', () => {
  test('WINNER market', () => {
    const pick: Pick = { market: 'WINNER', outcome: 'HOME' };
    expect(isPredictionCorrect(pick, { homeScore: 2, awayScore: 1 })).toBe(true);
    expect(isPredictionCorrect(pick, { homeScore: 1, awayScore: 1 })).toBe(false);
  });

  test('EXACT_SCORE market', () => {
    const pick: Pick = { market: 'EXACT_SCORE', homeScore: 2, awayScore: 1 };
    expect(isPredictionCorrect(pick, { homeScore: 2, awayScore: 1 })).toBe(true);
    expect(isPredictionCorrect(pick, { homeScore: 3, awayScore: 1 })).toBe(false);
  });

  test('rejects invalid results', () => {
    const pick: Pick = { market: 'WINNER', outcome: 'HOME' };
    expect(() => isPredictionCorrect(pick, { homeScore: -1, awayScore: 0 })).toThrow();
  });
});
