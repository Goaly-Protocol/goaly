import { describe, expect, test } from 'bun:test';
import { computeBracket, computeStandings, type FifaMatch } from '../src/lib/standings';
import { StandingsService } from '../src/services/standings.service';

const GROUP_STAGE = '289273';

function match(
  group: string,
  home: string,
  away: string,
  hs: number | null,
  as: number | null,
): FifaMatch {
  return {
    IdStage: GROUP_STAGE,
    IdGroup: group,
    GroupName: [{ Description: 'Group A' }],
    Home: { TeamName: [{ Description: home }] },
    Away: { TeamName: [{ Description: away }] },
    HomeTeamScore: hs,
    AwayTeamScore: as,
  };
}

describe('computeStandings', () => {
  test('tallies points + GD and ranks the group', () => {
    const group = computeStandings(
      [
        match('g1', 'Spain', 'Austria', 2, 0), // Spain W
        match('g1', 'Croatia', 'Spain', 1, 3), // Spain W
        match('g1', 'Austria', 'Croatia', 1, 1), // draw
      ],
      GROUP_STAGE,
    )[0];
    expect(group?.rows[0]?.team).toBe('Spain');
    expect(group?.rows[0]?.points).toBe(6);
    expect(group?.rows[0]?.gd).toBe(4); // (2-0) + (3-1) = +4
    const austria = group?.rows.find((r) => r.team === 'Austria');
    expect(austria?.points).toBe(1);
    expect(austria?.played).toBe(2);
  });

  test('excludes knockout matches and unplayed fixtures', () => {
    const group = computeStandings(
      [
        match('g1', 'A', 'B', 1, 0),
        match('g1', 'A', 'C', null, null), // not played yet
        { ...match('g1', 'D', 'E', 2, 2), IdStage: '999' }, // knockout stage
      ],
      GROUP_STAGE,
    )[0];
    expect(group?.rows.find((r) => r.team === 'A')?.played).toBe(1);
    expect(group?.rows.find((r) => r.team === 'C')?.played).toBe(0);
    expect(group?.rows.find((r) => r.team === 'D')).toBeUndefined();
  });

  test('empty input yields no groups', () => {
    expect(computeStandings([], GROUP_STAGE)).toEqual([]);
  });
});

describe('computeBracket', () => {
  const ko = (
    stage: string,
    home: string,
    away: string,
    hs: number | null,
    as: number | null,
  ): FifaMatch => ({
    IdStage: stage,
    Home: { TeamName: [{ Description: home }] },
    Away: { TeamName: [{ Description: away }] },
    HomeTeamScore: hs,
    AwayTeamScore: as,
  });

  test('groups knockout ties by round and skips empty rounds', () => {
    const rounds = computeBracket([
      ko('289287', 'Spain', 'Croatia', 2, 1), // Round of 32
      ko('289292', 'Brazil', 'France', null, null), // Final (still TBD)
      ko(GROUP_STAGE, 'X', 'Y', 1, 0), // group stage → ignored
    ]);
    expect(rounds.map((r) => r.name)).toEqual(['Round of 32', 'Final']);
    expect(rounds[0]?.matches[0]).toMatchObject({
      home: 'Spain',
      away: 'Croatia',
      homeScore: 2,
      awayScore: 1,
    });
  });
});

describe('StandingsService', () => {
  test('fetches, computes, then serves from cache until TTL', async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls += 1;
      return { ok: true, json: async () => ({ Results: [match('g1', 'A', 'B', 3, 0)] }) };
    }) as unknown as typeof fetch;
    let clock = 0;
    const svc = new StandingsService(fakeFetch, () => clock);

    const first = await svc.get();
    expect(first[0]?.rows[0]?.team).toBe('A');
    expect(calls).toBe(1);

    await svc.get(); // within TTL
    expect(calls).toBe(1);

    clock = 20 * 60 * 1000; // past the 10-min TTL
    await svc.get();
    expect(calls).toBe(2);
  });

  test('serves last-good data when FIFA is unreachable', async () => {
    const failFetch = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    const svc = new StandingsService(failFetch, () => 0);
    expect(await svc.get()).toEqual([]);
  });
});
