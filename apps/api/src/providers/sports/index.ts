import type { Env } from '../../env';
import { MockSportsProvider } from './mock';
import { TheOddsApiProvider } from './the-odds-api';
import type { SportsDataProvider } from './types';

export * from './types';
export { MockSportsProvider } from './mock';
export { TheOddsApiProvider, KeyRing } from './the-odds-api';

/** Parse configured API keys (THE_ODDS_API_KEYS csv, or single THE_ODDS_API_KEY). */
export function oddsApiKeys(env: Env): string[] {
  const raw = env.THE_ODDS_API_KEYS ?? env.THE_ODDS_API_KEY ?? '';
  return raw
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

/** Pick the real provider when keys are configured, else the mock. */
export function createSportsProvider(env: Env): SportsDataProvider {
  const keys = oddsApiKeys(env);
  return keys.length > 0 ? new TheOddsApiProvider(keys) : new MockSportsProvider();
}
