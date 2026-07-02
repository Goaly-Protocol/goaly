# @goalyield/api

Bun + Hono + Drizzle (SQLite) API for GoalYield. Serves match data, predictions and
settlement, and keeps the cache fresh with a **credit-aware** sync against The Odds API.

## Run

```bash
bun run --filter @goalyield/api dev     # http://localhost:3001
```

- API reference (Scalar): `GET /docs`
- OpenAPI spec: `GET /openapi.json`

## The Odds API credit strategy (free tier = 500 credits/month)

The golden rule: **user requests never call the odds API.** Every user-facing route reads
the local SQLite cache; only the background `SyncService.tick()` spends credits.

| Sync step    | Endpoint  | Cost                | When it runs                                                                             |
| ------------ | --------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `syncEvents` | `/events` | **0** (free)        | every tick — our source of fixtures + kickoff times                                      |
| `syncScores` | `/scores` | 1 (2 w/ `daysFrom`) | only when due _and_ a match is ≥ `ODDS_SETTLE_BUFFER_S` past kickoff and still unsettled |
| `syncOdds`   | `/odds`   | markets × regions   | only when due _and_ estimated credits > `ODDS_CREDIT_RESERVE`                            |

Extra guards:

- **Reserve** — odds refreshes are skipped once credits drop near the reserve, so
  settlement (`/scores`) always has budget.
- **Throttles** — `ODDS_REFRESH_INTERVAL_MS` / `ODDS_SCORES_INTERVAL_MS` cap call frequency.
- **Usage tracking** — every paid call records `x-requests-remaining` into `api_usage`;
  see `GET /admin/usage`.

## Key rotation / fallback

Set multiple keys via `THE_ODDS_API_KEYS` (comma-separated). `TheOddsApiProvider` uses a
`KeyRing`: on `401`/`429` it rotates to the next key, so N free keys give ≈ N×500 credits
of headroom and automatic failover. `SyncService.creditsRemaining()` accounts for the
spare keys.

## Football results / settlement oracle

MVP settlement uses either The Odds API `/scores` (completed games) or the admin route
`POST /admin/matches/:id/result` (manual oracle, disclosed). An on-chain oracle is the
roadmap for trust-minimized settlement.
