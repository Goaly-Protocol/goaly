import { describe, expect, test } from 'bun:test';
import { KeyRing, mapEvent, mapScore } from '../src/the-odds-api';

describe('KeyRing', () => {
  test('rotates through keys and stops at the last', () => {
    const ring = new KeyRing(['k1', 'k2']);
    expect(ring.current()).toBe('k1');
    expect(ring.rotate()).toBe(true);
    expect(ring.current()).toBe('k2');
    expect(ring.rotate()).toBe(false);
    expect(ring.current()).toBe('k2');
  });

  test('totalRemaining treats unseen keys as full', () => {
    const ring = new KeyRing(['k1', 'k2', 'k3']);
    ring.note(100); // current key (k1)
    expect(ring.totalRemaining(500)).toBe(100 + 500 + 500);
  });

  test('requires at least one key', () => {
    expect(() => new KeyRing([])).toThrow('at least one');
  });
});

describe('the-odds-api mappers', () => {
  test('mapEvent normalizes to a core Match', () => {
    const match = mapEvent({
      id: 'e1',
      commence_time: '2026-07-15T18:00:00Z',
      home_team: 'Argentina',
      away_team: 'Brazil',
    });
    expect(match.id).toBe('e1');
    expect(match.homeTeam).toBe('Argentina');
    expect(match.status).toBe('SCHEDULED');
    expect(match.kickoff).toBe(Math.floor(Date.parse('2026-07-15T18:00:00Z') / 1000));
  });

  test('mapScore only returns completed results', () => {
    expect(
      mapScore({ id: 'e1', completed: false, home_team: 'A', away_team: 'B', scores: null }),
    ).toBeNull();

    const entry = mapScore({
      id: 'e1',
      completed: true,
      home_team: 'A',
      away_team: 'B',
      scores: [
        { name: 'A', score: '2' },
        { name: 'B', score: '1' },
      ],
    });
    expect(entry?.result).toEqual({ homeScore: 2, awayScore: 1 });
  });
});
