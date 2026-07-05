# @goaly/api

The backend for [Goaly](https://api.goaly.fun) — a **Bun + Hono + Drizzle** (SQLite) API. It serves
match data, football standings and the bracket, user predictions, and the autonomous yield agent's
status. All user-facing routes read a local cache, so they never depend on a paid upstream.

## Run

```bash
bun run --filter @goaly/api dev     # http://localhost:3001
bun test                            # tests
```

- API reference (Scalar): `GET /docs`
- OpenAPI spec: `GET /openapi.json`

## What it serves

| Route | Description |
| --- | --- |
| `GET /matches`, `/matches/:id` | Bettable fixtures with team metadata and odds (cached) |
| `GET /standings` | Group standings, enriched with team flags |
| `GET /bracket`, `/bracket/viewer` | Knockout bracket (plain + brackets-viewer.js shape) |
| `GET /predictions?userId=` | A wallet's predictions, joined to their matches |
| `POST /predictions` | Record an off-chain prediction |
| `GET /agent` | Yield agent status; `POST /agent/run` refreshes the decision, `POST /agent/rebalance` executes it on-chain |
| `POST /admin/*` | Sync, manual result/settlement, on-chain settlement, credit usage |
| `GET /health` | Liveness |

## On-chain bet indexer

The chain is the source of truth for predictions. A background indexer scans `GoalyMarkets`
`Predicted` events on Arbitrum (from the deploy block, in block chunks) and upserts them into the
predictions table — idempotently, one row per log. So a wallet's bets always show even if the
client's off-chain `POST /predictions` failed (e.g. a blocked network).

When `ORACLE_PK` is configured, finished matches also auto-settle their on-chain market via a WDK
signer.

## Odds sync (The Odds API — free tier)

User requests never call the odds API; only the background `SyncService.tick()` spends credits.

| Sync step | Endpoint | Cost | When |
| --- | --- | --- | --- |
| `syncEvents` | `/events` | 0 (free) | every tick — fixtures + kickoff times |
| `syncScores` | `/scores` | 1–2 | a match is past kickoff and still unsettled |
| `syncOdds` | `/odds` | markets × regions | due, and estimated credits stay above the reserve |

A credit **reserve** protects settlement budget, `ODDS_*_INTERVAL_MS` throttles cap call frequency,
and every paid call records `x-requests-remaining` into `api_usage` (see `GET /admin/usage`). Set
multiple comma-separated keys via `THE_ODDS_API_KEYS` for rotation and failover on `401`/`429`.
