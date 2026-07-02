import { describe, expect, test } from 'bun:test';
import { parseH2hOdds, winningOddsBps } from '../src/lib/odds';

const bookmakers = JSON.stringify([
  {
    markets: [
      {
        key: 'h2h',
        outcomes: [
          { name: 'Spain', price: 1.3 },
          { name: 'Austria', price: 8.0 },
          { name: 'Draw', price: 4.2 },
        ],
      },
    ],
  },
  {
    markets: [
      {
        key: 'h2h',
        outcomes: [
          { name: 'Spain', price: 1.4 },
          { name: 'Austria', price: 7.0 },
          { name: 'Draw', price: 4.0 },
        ],
      },
    ],
  },
]);

describe('parseH2hOdds', () => {
  test('averages h2h prices across bookmakers', () => {
    const odds = parseH2hOdds(bookmakers, 'Spain', 'Austria');
    expect(odds?.home).toBeCloseTo(1.35);
    expect(odds?.away).toBeCloseTo(7.5);
    expect(odds?.draw).toBeCloseTo(4.1);
  });

  test('returns null for empty or invalid odds', () => {
    expect(parseH2hOdds('[]', 'Spain', 'Austria')).toBeNull();
    expect(parseH2hOdds('not json', 'Spain', 'Austria')).toBeNull();
  });
});

describe('winningOddsBps', () => {
  test('converts the winning outcome odds to bps', () => {
    const odds = parseH2hOdds(bookmakers, 'Spain', 'Austria');
    expect(winningOddsBps(odds, 'AWAY')).toBe(75_000n); // 7.5 × 10_000
    expect(winningOddsBps(odds, 'HOME')).toBe(13_500n); // 1.35 × 10_000
  });

  test('defaults to 10_000 (no boost) when odds are missing', () => {
    expect(winningOddsBps(null, 'HOME')).toBe(10_000n);
  });
});
