# Goaly ⚽

> **No-loss football predictions on Arbitrum.**
> Stake a stablecoin on who wins. Your stake always comes back in full — win to earn a share of a
> **yield-funded, odds-boosted prize**. Your principal is never at risk from a wrong prediction.

Built for the **[Tether Developers Cup](https://dorahacks.io/hackathon/tether-developers-cup)** — **WDK track**.

**Live:** [app.goaly.fun](https://app.goaly.fun) · **API:** [api.goaly.fun](https://api.goaly.fun) ([docs](https://api.goaly.fun/docs)) · **Odds feed:** [odds.goaly.fun](https://odds.goaly.fun)

---

## What is Goaly?

A prediction market where you **cannot lose your principal**. Instead of losers funding winners, the
**yield** that all staked capital earns on [Morpho](https://morpho.org) funds the prize pool. Everyone
gets their stake back; winners additionally split the yield, boosted by the match odds.

- 🛡️ **No-loss** — your stake is returned in full, always.
- 🪙 **Any stablecoin** — stake in **USDT / USDC**, claim back in whichever you choose.
- 📈 **Yield-funded prizes** — winnings come from Morpho yield, not other players' losses.
- 🎯 **Odds-boosted** — back an underdog, win a bigger slice (boost capped by the on-chain reserve).
- 🤖 **Autonomous WDK agent** — a self-custodial agent wallet continuously rebalances the pool's
  yield to the best risk-adjusted Morpho vault, across **chains and tokens**.

## How it works

```
                    stake USDT / USDC                       claim (any stablecoin)
   ┌──────────┐  ──────────────────────►  ┌────────────┐  ──────────────────────►  ┌──────────┐
   │  Player  │                           │ GoalyPool  │   stake back + prize      │  Player  │
   └──────────┘  ◄──────────────────────  └─────┬──────┘                           └──────────┘
                                                │ supplies USDT0
                                                ▼
                                        ┌────────────────┐   yield ──► prize reserve
                                        │  Morpho vault  │
                                        └───────┬────────┘
                                                │ migrate (best APY)
                                                ▼
                                     ┌─────────────────────────┐
                                     │  WDK Yield Agent (bot)   │  scans every chain + stablecoin
                                     └─────────────────────────┘
```

1. **Predict** a match by staking a stablecoin — the pool normalises it to **USDT0** (swapping on-chain
   if needed) and supplies it to a **Morpho** ERC-4626 vault.
2. **No-loss:** your stake is tracked 1:1 and returned in full at claim.
3. **Yield → prizes:** value earned above total staked principal funds an odds-boosted prize pool.
4. **Settle & claim:** winners split the prize pro-rata; everyone reclaims their stake, paid out in
   the token they choose (deposit USDT → withdraw USDT).

> ⚠️ "No-loss" means safe from _wrong predictions_ — not from smart-contract / DeFi / bridge risk.

## The autonomous WDK yield agent ⭐

The heart of our **WDK** submission: an autonomous **self-custodial wallet** — built on Tether's
[`@tetherto/wdk-wallet-evm`](https://www.npmjs.com/package/@tetherto/wdk-wallet-evm) — that holds
`MANAGER_ROLE` on `GoalyPool` and optimises the protocol's yield with no human in the loop.

- **Scans the whole market** — every Morpho stablecoin vault across Ethereum, Base, Arbitrum,
  Optimism, Polygon and Unichain (via the Morpho GraphQL API).
- **Rebalances same-chain automatically** — migrates the backing to the best risk-adjusted vault,
  swapping **USDT0 ↔ USDC** on-chain (Uniswap V3) while keeping the pool 1:1.
- **Cross-chain aware** — when the best vault lives on another chain, it plans and validates a
  **[Wormhole](https://wormhole.com) Automatic CCTP** route to reach it (bridge USDC + deposit).
- **Signs its own transactions** with the WDK wallet — the agent literally _is_ a wallet.

## Smart contracts

Solidity 0.8.24, OpenZeppelin, built & tested with **Foundry** — [`packages/contracts`](packages/contracts).

### Deployed — Arbitrum One

| Contract      | Address                                                                                                                | Purpose                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **GoalyPool** | [`0x009b57aefAC6b10dF71a49982Eb3f678D2b4966C`](https://arbiscan.io/address/0x009b57aefAC6b10dF71a49982Eb3f678D2b4966C) | No-loss prediction markets **+** built-in Morpho yield engine |
| USDT0 (asset) | [`0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`](https://arbiscan.io/address/0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9) | Canonical accounting token (Tether USD₮0)                     |

### `GoalyPool` in a nutshell

A single contract that merges the vault and the market — **no receipt token**, no extra approvals.

```solidity
// Predict: stake any supported stablecoin; the pool swaps→USDT0 + supplies to Morpho.
function placePrediction(bytes32 marketId, Outcome outcome, IERC20 token, uint256 amount, uint256 minStake);

// Claim: reclaim your stake (+ prize if you won), paid out in the token you choose.
function claim(bytes32 marketId, IERC20 outToken, uint256 minOut);
```

- **`ORACLE_ROLE`** — opens markets (`createMarket`) and settles them with the result + winning odds
  (`settleMarket`); the odds boost is drawn from a yield-funded reserve.
- **`MANAGER_ROLE`** (the WDK agent) — `migrateYieldVault` (cross-asset, swaps at the edges),
  `harvestYield`, `setSwapConfig`.
- **No-loss invariant** — stakes live in Morpho and are always redeemable 1:1 for USDT0; withdrawals
  use an exact-output swap so holders receive their full amount, with any swap cost drawn from yield.
- Covered by unit tests **and** an Arbitrum fork test (predict → migrate USDT0 → real USDC vault via
  the real Uniswap pool → claim full USDT0).

```bash
cd packages/contracts
forge test                                                    # unit
ARBITRUM_RPC_URL=... forge test --match-path 'test/fork/*'    # integration (real Morpho + Uniswap)
```

## Architecture

```
apps/
  app/         Next.js 16 dApp — predict, claim, standings, agent dashboard  (→ app.goaly.fun)
  api/         Bun + Hono + Drizzle/SQLite — matches, odds, standings, agent (→ api.goaly.fun)
  landing/     Marketing site
  indexer/     Ponder on-chain indexer
packages/
  contracts/       Foundry / Solidity — GoalyPool + tests
  core/            Pure TS domain — odds model, rebalance policy, cross-chain routing (unit-tested)
  plugin-onchain/  viem reads/writes, Morpho GraphQL, Wormhole route integration
  plugin-odds/     Goaly odds feed provider (Asian-Handicap / O-U → Poisson-derived 1X2)
  plugin-wdk/      Tether WDK wallet wrapper (the agent + oracle signer)
  plugin-teams/    Team / flag / crest resolution
```

## Tech stack

| Layer        | Tech                                                         |
| ------------ | ------------------------------------------------------------ |
| Contracts    | **Foundry** · Solidity 0.8.24 · OpenZeppelin · Uniswap V3    |
| Yield        | **Morpho** MetaMorpho (ERC-4626) on **Arbitrum**             |
| Asset        | **USDT0** (Tether omnichain USD₮) · **USDC**                 |
| Agent wallet | **Tether WDK** (`@tetherto/wdk-wallet-evm`) — self-custodial |
| Cross-chain  | **Wormhole** (Automatic CCTP)                                |
| Web          | **Next.js 16** · wagmi · Reown AppKit · Tailwind             |
| API          | **Bun** · Hono · Drizzle · SQLite · Scalar (OpenAPI)         |
| Monorepo     | **Bun workspaces** · Turborepo · Biome                       |

## Getting started

Requires **[Bun](https://bun.sh)** and (for contracts) **[Foundry](https://getfoundry.sh)**.

```bash
bun install
cp .env.example .env          # fill in ORACLE_PK, ODDS_API_KEY, ARBITRUM_RPC_URL, …
bun run dev                   # API + app + landing via Turborepo
```

- **API** → http://localhost:3001 (docs at `/docs`)
- **App** → http://localhost:3000

```bash
bun run typecheck                                    # all TS packages
bunx turbo run test --filter='!@goaly/contracts'     # TS tests
```

## Deployment

- **App** → Netlify (`app.goaly.fun`) — GitHub Actions deploys on push to `main`.
- **API** → self-hosted VPS behind nginx + certbot (`api.goaly.fun`), managed by pm2 — GitHub Actions
  rsyncs + restarts on push to `main`.
- **Contracts** → `forge script script/Deploy.s.sol --rpc-url arbitrum --broadcast`.

## License

Apache-2.0
