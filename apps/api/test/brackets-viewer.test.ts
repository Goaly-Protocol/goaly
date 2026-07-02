import { describe, expect, test } from 'bun:test';
import { toBracketsViewer } from '../src/lib/brackets-viewer';
import type { BracketRound } from '../src/lib/standings';

const code = (t: string) => t.slice(0, 3).toUpperCase();

const rounds: BracketRound[] = [
  {
    id: '289287',
    name: 'Round of 32',
    matches: [
      {
        home: 'Spain',
        away: 'Croatia',
        homeScore: 2,
        awayScore: 1,
        homePens: null,
        awayPens: null,
      },
      { home: 'Brazil', away: 'Japan', homeScore: 1, awayScore: 1, homePens: 4, awayPens: 3 },
    ],
  },
  {
    id: '289292',
    name: 'Final',
    matches: [
      { home: '', away: '', homeScore: null, awayScore: null, homePens: null, awayPens: null },
    ],
  },
  {
    id: '289291',
    name: 'Third place',
    matches: [{ home: 'X', away: 'Y', homeScore: 0, awayScore: 0, homePens: null, awayPens: null }],
  },
];

describe('toBracketsViewer', () => {
  const data = toBracketsViewer(rounds, code);

  test('excludes the third-place round', () => {
    expect(new Set(data.matches.map((m) => m.round_id))).toEqual(new Set([0, 1]));
    expect(data.participants.some((p) => p.name === code('X'))).toBe(false);
  });

  test('marks the winner via score and penalties', () => {
    const spainId = data.participants.find((p) => p.name === code('Spain'))?.id;
    const r32m1 = data.matches[0];
    expect(r32m1?.status).toBe(4); // completed
    expect(r32m1?.opponent1?.id).toBe(spainId ?? -1);
    expect(r32m1?.opponent1?.result).toBe('win');
    expect(r32m1?.opponent2?.result).toBe('loss');
    expect(data.matches[1]?.opponent1?.result).toBe('win'); // Brazil win on penalties
  });

  test('TBD final has null opponents and waiting status', () => {
    const final = data.matches.find((m) => m.round_id === 1);
    expect(final?.status).toBe(1); // waiting
    expect(final?.opponent1).toEqual({ id: null });
  });

  test('single-elimination stage sized from the first round', () => {
    expect(data.stages[0]?.type).toBe('single_elimination');
    expect(data.stages[0]?.settings.size).toBe(4); // 2 R32 matches × 2
  });
});
