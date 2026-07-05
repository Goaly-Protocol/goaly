# @goaly/plugin-odds

Sports data provider — The Odds API adapter (credit-aware, key rotation) + mock.

Goaly needs live fixtures, results and 1X2 odds to open, settle and price its prediction markets. This
package hides the data source behind one small `SportsDataProvider` interface so the [Goaly](https://goaly.fun)
API and yield agent don't care where the numbers come from. It ships three implementations — the free
public Goaly Odds feed, The Odds API, and a deterministic mock — and picks the right one from config.

## What it does

- **One interface** — `listEvents` / `listScores` / `listOdds`, returning `@goaly/core` `Match` shapes.
- **The Odds API adapter** — credit-aware: parses quota headers and rotates through a ring of API keys,
  falling back to the next key on `401` / `429` so free keys stack for more monthly headroom.
- **Goaly Odds feed** — a free, no-auth public board; derives fair 1X2 decimal odds from Asian Handicap
  - Over/Under lines with a Poisson goals model, and keeps live matches bettable within a time window.
- **Mock** — a zero-credit in-memory provider for local dev and tests.
- **Auto-select** — `createSportsProvider` chooses the feed, The Odds API, or the mock from config.

## Usage

```ts
import { createSportsProvider, parseOddsApiKeys } from '@goaly/plugin-odds';

const keys = parseOddsApiKeys(process.env.ODDS_API_KEYS); // comma-separated list
const provider = createSportsProvider(keys, process.env.GOALY_ODDS_URL);

const { data: matches, quota } = await provider.listEvents('soccer_epl');
console.log(matches.length, 'matches', quota?.remaining, 'credits left');
```

## API

- **`SportsDataProvider`** — the provider interface (`ProviderResult<T>`, `ScoreEntry`, `OddsEntry`, `QuotaInfo`).
- **`createSportsProvider`** — pick a provider from config (Goaly feed → The Odds API → mock).
- **`parseOddsApiKeys`** — parse a comma-separated key list into a rotation ring.
- **`TheOddsApiProvider`** / **`KeyRing`** — The Odds API adapter with quota tracking + key rotation.
- **`GoalyOddsProvider`** — the free Goaly Odds feed adapter, with `deriveH2h`, `malayToDecimal`,
  `parseKickoff`, `parseScore`, `isLive` and `LIVE_MATCH_WINDOW_S`.
- **`MockSportsProvider`** — deterministic in-memory provider for dev/tests.

---

Internal workspace package of the Goaly monorepo — not published to npm.
