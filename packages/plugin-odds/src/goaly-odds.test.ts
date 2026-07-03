import { describe, expect, test } from 'bun:test';
import {
  deriveH2h,
  GoalyOddsProvider,
  isLive,
  malayToDecimal,
  parseKickoff,
  parseScore,
} from './goaly-odds';

describe('malayToDecimal', () => {
  test('converts positive, negative, zero, null', () => {
    expect(malayToDecimal(0.9)).toBeCloseTo(1.9);
    expect(malayToDecimal(-0.9)).toBeCloseTo(2.111, 2);
    expect(malayToDecimal(0)).toBe(2);
    expect(malayToDecimal(null)).toBeNull();
  });
});

describe('parseKickoff', () => {
  test('site tz (UTC+7) → unix UTC', () => {
    // 2026-07-03 18:30:00 +07 == 11:30:00 UTC
    expect(parseKickoff('2026-07-03 18:30:00')).toBe(
      Math.floor(Date.UTC(2026, 6, 3, 11, 30, 0) / 1000),
    );
  });
});

describe('parseScore', () => {
  test('extracts scores, ignores trailing HT', () => {
    expect(parseScore('1 - 0')).toEqual({ homeScore: 1, awayScore: 0 });
    expect(parseScore('2 - 3 HT')).toEqual({ homeScore: 2, awayScore: 3 });
    expect(parseScore(null)).toBeNull();
  });
});

describe('isLive', () => {
  test('detects live clocks', () => {
    expect(isLive("2H 47'")).toBe(true);
    expect(isLive('HT')).toBe(true);
    expect(isLive('03/07 06:30PM')).toBe(false);
  });
});

describe('deriveH2h', () => {
  test('even match → home ≈ away, draw longest', () => {
    const o = deriveH2h(
      {
        handicap: { line: 0, home: 0.9, away: -0.9 },
        overunder: { line: 2.5, over: 0.9, under: -0.9 },
      },
      1,
    );
    expect(o).not.toBeNull();
    if (!o) return;
    expect(o.home).toBeCloseTo(o.away, 1);
    expect(o.draw).toBeGreaterThan(o.home);
  });

  test('home favored (isgive=1, big line) → home shortest odds', () => {
    const o = deriveH2h(
      {
        handicap: { line: 1.5, home: -0.9, away: 0.9 },
        overunder: { line: 3, over: 0.9, under: -0.9 },
      },
      1,
    );
    expect(o).not.toBeNull();
    if (!o) return;
    expect(o.home).toBeLessThan(o.away);
  });

  test('null when no over/under line', () => {
    expect(
      deriveH2h(
        {
          handicap: { line: 1, home: 0, away: 0 },
          overunder: { line: 0, over: null, under: null },
        },
        1,
      ),
    ).toBeNull();
  });
});

const board = {
  updated_at: '2026-07-02T20:40:14Z',
  sport: 'SOCCER',
  total: 2,
  matches: [
    {
      league: 'BRAZIL SERIE B',
      home: 'Alpha',
      away: 'Beta',
      kickoff: '2026-07-03 18:30:00',
      score: null,
      time: '06:30PM',
      isgive: 1,
      oddsid: 111,
      fulltime: {
        handicap: { line: 0.5, home: -0.9, away: 0.8 },
        overunder: { line: 2.5, over: 0.9, under: -0.9 },
      },
    },
    {
      league: 'E-FOOTBALL F24',
      home: 'X',
      away: 'Y',
      kickoff: '2026-07-03 18:00:00',
      score: '1 - 0',
      time: 'HT',
      isgive: 0,
      oddsid: 222,
      fulltime: {
        handicap: { line: 0, home: 0.9, away: 0.9 },
        overunder: { line: 3, over: 0.9, under: -0.9 },
      },
    },
  ],
};

describe('GoalyOddsProvider', () => {
  const fakeFetch = (async () => ({ json: async () => board })) as unknown as typeof fetch;
  const provider = new GoalyOddsProvider('http://feed', undefined, fakeFetch, () => 0);

  test('listEvents skips e-football and maps real matches with a stable id', async () => {
    const { data } = await provider.listEvents();
    expect(data).toHaveLength(1);
    expect(data[0]?.id).toMatch(/^g-alpha-beta-/); // teams + kickoff, not oddsid
    expect(data[0]?.homeTeam).toBe('Alpha');
  });

  test('listOdds derives h2h in the bookmakers shape', async () => {
    const { data } = await provider.listOdds();
    expect(data[0]?.matchId).toMatch(/^g-alpha-beta-/);
    const json = JSON.stringify(data[0]?.data);
    expect(json).toContain('"key":"h2h"');
    expect(json).toContain('"name":"Draw"');
    expect(json).toContain('"name":"Alpha"');
  });

  test('listScores parses scores + live/finished across all matches', async () => {
    const { data } = await provider.listScores();
    const live = data.find((s) => s.matchId.startsWith('g-x-y-'));
    expect(live?.result).toEqual({ homeScore: 1, awayScore: 0 });
    expect(live?.completed).toBe(false); // HT = still live
  });
});
