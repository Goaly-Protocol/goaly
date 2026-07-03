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
  const data = toBracketsViewer(rounds, (t) => ({
    name: code(t),
    imageUrl: `https://flagcdn.com/w40/${t.slice(0, 2).toLowerCase()}.png`,
  }));

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
    expect(r32m1?.opponent1?.score).toBe(2); // plain score when no shootout
    // Brazil 1-1 Japan, won 4-3 on penalties → shootout in parens before the goal score.
    expect(data.matches[1]?.opponent1?.result).toBe('win');
    expect(data.matches[1]?.opponent1?.score).toBe('(4) 1');
    expect(data.matches[1]?.opponent2?.score).toBe('(3) 1');
  });

  test('TBD final has null opponents and waiting status', () => {
    const final = data.matches.find((m) => m.round_id === 1);
    expect(final?.status).toBe(1); // waiting
    expect(final?.opponent1).toEqual({ id: null });
  });

  test('reorders a round so its pairs feed the next round (connector alignment)', () => {
    const ko: BracketRound[] = [
      {
        id: 'r16',
        name: 'Round of 16',
        matches: [
          { home: 'A', away: 'B', homeScore: 2, awayScore: 0, homePens: null, awayPens: null }, // A
          { home: 'C', away: 'D', homeScore: 0, awayScore: 1, homePens: null, awayPens: null }, // D
          { home: 'E', away: 'F', homeScore: 3, awayScore: 1, homePens: null, awayPens: null }, // E
          { home: 'G', away: 'H', homeScore: 1, awayScore: 2, homePens: null, awayPens: null }, // H
        ],
      },
      {
        id: 'qf',
        name: 'Quarter-finals',
        matches: [
          {
            home: 'A',
            away: 'E',
            homeScore: null,
            awayScore: null,
            homePens: null,
            awayPens: null,
          },
          {
            home: 'D',
            away: 'H',
            homeScore: null,
            awayScore: null,
            homePens: null,
            awayPens: null,
          },
        ],
      },
    ];
    const out = toBracketsViewer(ko, (t) => ({ name: t, imageUrl: null }));
    const name = Object.fromEntries(out.participants.map((x) => [x.id, x.name]));
    const first = out.matches
      .filter((m) => m.round_id === 0)
      .sort((a, b) => a.number - b.number)
      .map((m) => name[(m.opponent1 as { id: number }).id]);
    // Pairs must be (A,E) then (D,H) to feed QF — so the home sides are A, E, C, G.
    expect(first).toEqual(['A', 'E', 'C', 'G']);
  });

  test('single-elimination stage sized from the first round', () => {
    expect(data.stages[0]?.type).toBe('single_elimination');
    expect(data.stages[0]?.settings.size).toBe(4); // 2 R32 matches × 2
  });

  test('emits a flag image per named participant', () => {
    expect(data.participantImages.length).toBe(data.participants.length);
    const spainId = data.participants.find((p) => p.name === code('Spain'))?.id;
    expect(data.participantImages.find((i) => i.participantId === spainId)?.imageUrl).toContain(
      'flagcdn.com',
    );
  });
});
