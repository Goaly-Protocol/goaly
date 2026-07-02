# GoalYield ⚽️🟡

> **No-loss football prediction, powered by self-repaying yield.**
> Predict the tournament. Wrong — you lose nothing. Right — you win real USD₮.
> You only ever wager your *future interest*, never your principal.

Built for the **[Tether Developers Cup](https://dorahacks.io/hackathon/tether-developers-cup)** · **WDK** track (self-custodial wallets) · theme: football & the global tournament moment.

---

## How it works (Model C)

1. You deposit **USD₮ (USDT0)** as collateral — this is your principal, and it is **never at risk**.
2. Deposits are pooled and supplied to a **Morpho** lending vault on **Arbitrum**, earning yield.
3. You place football predictions using borrowed **credit**, not your principal.
4. Winners take a share of the credit-stake pot.
5. Each player's debt **self-repays** from the yield their own deposit generates.

Worst case: you forgo some yield. Best case: you win real USD₮. Your principal always comes back whole.

> ⚠️ "Principal safe" means safe from *game losses*, not from smart-contract / protocol risk. See the risk disclosure in the app and docs.

## Tech stack

| Layer | Tech |
| --- | --- |
| Wallet / signing | **WDK** (`@tetherto/wdk`) — self-custodial |
| Asset | **USDT0** (Tether's omnichain USD₮, LayerZero OFT) |
| Yield | **Morpho** MetaMorpho vault (ERC-4626) on **Arbitrum** |
| Contracts | **Foundry** (Solidity) — `packages/contracts` |
| Shared domain logic | **`@goalyield/core`** — pure TS, fully unit-tested |
| API | **Bun + Hono + Drizzle + SQLite** — `apps/api` |
| Indexer | **Ponder** — `apps/indexer` |
| Web | **Vite + React 19 + HeroUI** — `apps/goaly-web` |

## Monorepo layout

```
apps/
  goaly-web/   Vite + HeroUI frontend
  api/         Bun + Hono REST API (Drizzle + SQLite)
  indexer/     Ponder — indexes on-chain events on Arbitrum
packages/
  core/        Domain logic (self-repay math, scoring, pot distribution), types, constants, ABIs
  contracts/   Foundry — GoalYieldVault + PredictionPool, unit + fork-integration tests
```

## Getting started

Prerequisites: [Bun](https://bun.sh) ≥ 1.2, [Foundry](https://getfoundry.sh).

```bash
bun install
cp .env.example .env         # then set ARBITRUM_RPC_URL

# Contracts
bun run --filter @goalyield/contracts build
bun run --filter @goalyield/contracts test          # unit tests (mocks)
bun run --filter @goalyield/contracts test:integration   # fork tests (needs ARBITRUM_RPC_URL)

# TypeScript
bun run test          # all unit + integration tests via Turborepo
bun run dev           # run all apps in dev
```

## Testing strategy

- **`packages/core`** — unit tests (`bun test`) over every pure domain function.
- **`packages/contracts`** — Foundry unit tests against mocks + **fork integration tests** against the real Morpho USDT0 vault on Arbitrum.
- **`apps/api`** — integration tests hitting the Hono app against an in-memory SQLite DB.

## Demo / networks

The hackathon does **not** require mainnet. We develop and demo against an **Arbitrum mainnet fork**
(real Morpho + USDT0 contracts, seeded accounts, free, with time fast-forward to visualise the
self-repaying mechanic). See `packages/contracts` for the fork setup.

## Third-party components (disclosure)

Morpho (lending), USDT0 / LayerZero (asset & bridge), Arbitrum (L2), WDK (wallet). Football match
data integration is deferred; results are entered via an admin/mock oracle in the MVP (disclosed).

## License

[Apache-2.0](./LICENSE).
