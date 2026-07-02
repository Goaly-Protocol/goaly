import type { Match } from '@goalyield/core';
import type { OddsEntry, ProviderResult, QuotaInfo, ScoreEntry, SportsDataProvider } from './types';

const BASE_URL = 'https://api.the-odds-api.com/v4';

interface TheOddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface TheOddsScore {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
}

/**
 * Round-robin ring of API keys for rotation + fallback. When a key returns 401
 * (invalid) or 429 (out of credits), we rotate to the next; each free key adds
 * ~500 credits/month of headroom.
 */
export class KeyRing {
  private idx = 0;
  readonly remaining = new Map<string, number>();

  constructor(private readonly keys: string[]) {
    if (keys.length === 0) throw new Error('KeyRing: at least one API key is required');
  }

  current(): string {
    return this.keys[this.idx]!;
  }

  size(): number {
    return this.keys.length;
  }

  /** Advance to the next key. Returns false when the last key is already active. */
  rotate(): boolean {
    if (this.idx < this.keys.length - 1) {
      this.idx += 1;
      return true;
    }
    return false;
  }

  note(remaining: number | null): void {
    if (remaining !== null) this.remaining.set(this.current(), remaining);
  }

  /** Total credits believed available across all keys (unseen keys assumed full). */
  totalRemaining(fullPerKey: number): number {
    return this.keys.reduce((acc, key) => acc + (this.remaining.get(key) ?? fullPerKey), 0);
  }
}

export class TheOddsApiProvider implements SportsDataProvider {
  readonly name = 'the-odds-api';
  readonly ring: KeyRing;

  constructor(apiKeys: string[]) {
    this.ring = new KeyRing(apiKeys);
  }

  private parseQuota(res: Response): QuotaInfo {
    const num = (header: string): number | null => {
      const raw = res.headers.get(header);
      return raw === null ? null : Number(raw);
    };
    const quota: QuotaInfo = {
      remaining: num('x-requests-remaining'),
      used: num('x-requests-used'),
      lastCost: num('x-requests-last'),
    };
    this.ring.note(quota.remaining);
    return quota;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<ProviderResult<T>> {
    for (;;) {
      const url = new URL(`${BASE_URL}${path}`);
      url.searchParams.set('apiKey', this.ring.current());
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

      const res = await fetch(url);
      if (res.ok) {
        const quota = this.parseQuota(res);
        return { data: (await res.json()) as T, quota };
      }
      // Rotate to a fallback key on auth / quota errors.
      if ((res.status === 401 || res.status === 429) && this.ring.rotate()) {
        continue;
      }
      throw new Error(`the-odds-api ${path} failed: ${res.status} ${await res.text()}`);
    }
  }

  async listEvents(sportKey: string): Promise<ProviderResult<Match[]>> {
    const result = await this.get<TheOddsEvent[]>(`/sports/${sportKey}/events`, {});
    return { ...result, data: result.data.map(mapEvent) };
  }

  async listScores(
    sportKey: string,
    opts?: { daysFrom?: 1 | 2 | 3 },
  ): Promise<ProviderResult<ScoreEntry[]>> {
    const params: Record<string, string> = {};
    if (opts?.daysFrom) params.daysFrom = String(opts.daysFrom);
    const result = await this.get<TheOddsScore[]>(`/sports/${sportKey}/scores`, params);
    const data = result.data
      .map(mapScore)
      .filter((entry): entry is ScoreEntry => entry !== null);
    return { ...result, data };
  }

  async listOdds(
    sportKey: string,
    opts: { regions: string; markets: string },
  ): Promise<ProviderResult<OddsEntry[]>> {
    const result = await this.get<Array<{ id: string; bookmakers?: unknown }>>(
      `/sports/${sportKey}/odds`,
      { regions: opts.regions, markets: opts.markets, oddsFormat: 'decimal' },
    );
    const data: OddsEntry[] = result.data.map((event) => ({
      matchId: event.id,
      market: opts.markets,
      data: event.bookmakers ?? [],
    }));
    return { ...result, data };
  }
}

export function mapEvent(event: TheOddsEvent): Match {
  return {
    id: event.id,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    kickoff: Math.floor(Date.parse(event.commence_time) / 1000),
    round: 'GROUP',
    status: 'SCHEDULED',
  };
}

export function mapScore(score: TheOddsScore): ScoreEntry | null {
  if (!score.completed || !score.scores) return null;
  const scoreFor = (team: string): number =>
    Number(score.scores?.find((entry) => entry.name === team)?.score);
  const homeScore = scoreFor(score.home_team);
  const awayScore = scoreFor(score.away_team);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return null;
  return { matchId: score.id, result: { homeScore, awayScore }, completed: true };
}
