# @goaly/plugin-onchain

On-chain reads and writes for Goaly via viem — GoalyVault / GoalyMarkets, addresses and ABIs.

The bridge between [Goaly](https://goaly.fun)'s off-chain services and its Arbitrum contracts. It wraps
the minimal ABIs and viem calls the app, API and yield agent need — reading a user's redeemable USDT
principal and accrued yield, submitting predictions and claims, running oracle settlement, and scanning
Morpho for the agent to rebalance the vault's backing. Writes go through a `WalletProvider` from
[`@goaly/plugin-wdk`](../plugin-wdk), so the same code signs with a user's WDK wallet or a server key.

## What it does

- **Reads** — a read-only Arbitrum client; a user's goUSDT balance (their USDT principal, redeemable 1:1)
  and the vault's harvestable accrued yield.
- **Player actions** — approve + `predict` (the stake is deposited into the vault to earn yield) and
  `claim` a settled market; deposit straight into `GoalyVault`. Payouts are always in USDT (USD₮0).
- **Oracle actions** — open (`createMarket`), settle with the winning outcome's odds, harvest yield and
  fund the odds-boost reserve; deterministic on-chain market ids from off-chain match ids.
- **Yield agent** — fetch live Morpho vault snapshots (own vaults or the whole stablecoin landscape,
  cross-chain), read the vault's current backing, and `rebalance` across whitelisted strategies.

## Usage

```ts
import { createArbitrumClient, readGoUsdtBalance, ARBITRUM } from '@goaly/plugin-onchain';

const client = createArbitrumClient(process.env.ARBITRUM_RPC_URL);

// A user's redeemable USDT principal (goUSDT, 1:1 with USD₮0).
const principal = await readGoUsdtBalance(client, ARBITRUM.goaly.vault, userAddress);
```

## API

- **`createArbitrumClient`** — a read-only viem `PublicClient` for Arbitrum One.
- **`readGoUsdtBalance`** / **`readAccruedYield`** — vault reads (`goalyVaultAbi`).
- **`depositToVault`** — approve USDT + deposit into `GoalyVault`, minting goUSDT.
- **`predict`** / **`claimPayout`** — player market actions (`goalyMarketsAbi`, `marketIdFor`).
- **`createMarket`** / **`settleMarket`** / **`harvestYield`** / **`fundReserve`** — oracle actions.
- **`fetchVaultSnapshots`** / **`fetchStablecoinVaults`** — Morpho yield data for the agent.
- **`readYieldVault`** / **`rebalanceVault`** — read + migrate the vault's backing (`vaultAgentAbi`).
- **`ARBITRUM`** / **`DEFAULT_YIELD_VAULT`** — re-exported deployed addresses from `@goaly/core`.

---

Internal workspace package of the Goaly monorepo — not published to npm.
