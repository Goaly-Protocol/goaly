import { GoalyOddsProvider } from './goaly-odds';
import { MockSportsProvider } from './mock';
import { TheOddsApiProvider } from './the-odds-api';
import type { SportsDataProvider } from './types';

export * from './types';
export { MockSportsProvider } from './mock';
export { TheOddsApiProvider, KeyRing } from './the-odds-api';
export {
  GoalyOddsProvider,
  deriveH2h,
  malayToDecimal,
  parseKickoff,
  parseScore,
  isLive,
} from './goaly-odds';

/** Parse configured API keys (comma-separated list, or a single key). */
export function parseOddsApiKeys(keysCsv?: string, singleKey?: string): string[] {
  const raw = keysCsv ?? singleKey ?? '';
  return raw
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

/**
 * Pick the data provider: the Goaly Odds feed when a URL is set (free, no auth), else The Odds API
 * when keys are configured, else the mock.
 */
export function createSportsProvider(keys: string[], goalyOddsUrl?: string): SportsDataProvider {
  if (goalyOddsUrl) return new GoalyOddsProvider(goalyOddsUrl);
  return keys.length > 0 ? new TheOddsApiProvider(keys) : new MockSportsProvider();
}
