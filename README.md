# Goaly

> A self-custodial wallet app for football, on Arbitrum. Every player gets a **Tether WDK** wallet —
> keys on their device, no seed phrase — to stake and get paid in USDT. Your principal is never at
> risk: an autonomous agent puts the pool to work in DeFi, and only the yield it earns funds the prizes.

Built for the **Tether Developers Cup** — **WDK (Wallets)** track.

**Live:** [app.goaly.fun](https://app.goaly.fun) · [api.goaly.fun](https://api.goaly.fun) ([docs](https://api.goaly.fun/docs)) · [goaly.fun](https://goaly.fun)

## Built on Tether WDK

Goaly is a WDK app end to end — both the player and the agent hold their own keys:

- **Self-custodial player wallet.** Every account is a WDK wallet
  ([`@tetherto/wdk-wallet-evm`](https://www.npmjs.com/package/@tetherto/wdk-wallet-evm)) whose keys
  live on the user's device — no seed phrase to write down. It's derived deterministically from an
  EIP-712 sign-in signature, so it always restores from the user's connected wallet. Players **pay,
  claim, and send USDT** straight from it; WDK handles wallet creation, signing, and accounts.
- **Autonomous agent wallet.** The yield agent runs on its _own_ WDK wallet, reads Morpho APYs, and
  reallocates the pooled USDt across DeFi — an agent wallet doing autonomous finance, settling
  on-chain in USDt.
- **Safe by design.** App/agent logic is cleanly separated from wallet execution, and on-chain roles
  are least-privilege: the agent can only rebalance between whitelisted strategies — it can never
  touch principal or move funds to an EOA. Recovery is deterministic re-derivation, so there's
  nothing to lose.

Football is the theme; self-custody is the point.

## How it works

Players stake **USDT** (Tether's omnichain USD₮0) on who wins a match. Every stake is pooled into an
ERC-4626 vault and put to work earning yield on [Morpho](https://morpho.org); the principal stays
fully redeemable **1:1**. When a match settles, winners split a prize funded entirely by that yield —
the protocol fee is taken from the prize, never the stake. No-loss is enforced on-chain as an
invariant (`GoalyMarkets.isSolvent()`): the vault can only ever earn, so everyone can always withdraw
their principal.

> "No-loss" means safe from a wrong prediction — not from smart-contract, DeFi or bridge risk.

## Architecture

A layered protocol, all deployed and Arbiscan-verified on **Arbitrum One**:

| Contract | Address | Role |
| --- | --- | --- |
| **GoalyMarkets** | [`0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3`](https://arbiscan.io/address/0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3) | Prediction layer — `predict` / `claim`; routes stakes to the vault, pays yield-funded prizes |
| **GoalyVault** | [`0xFe424b5b85C742C15CCB09d62873bE72577CD7Ef`](https://arbiscan.io/address/0xFe424b5b85C742C15CCB09d62873bE72577CD7Ef) | ERC-4626 (UUPS) vault — pools principal, allocates across strategies, keeps a liquidity buffer |
| **MorphoStrategy** | [`0x6951adCCd2106Bf364D62A1CC328070FC49609eA`](https://arbiscan.io/address/0x6951adCCd2106Bf364D62A1CC328070FC49609eA) | Same-asset adapter — supplies USDT0 into a Morpho USDT0 vault |
| **MorphoSwapStrategy** | [`0xD12c112DA7D19266c5cBB9A9bde4Ee9e77D5393D`](https://arbiscan.io/address/0xD12c112DA7D19266c5cBB9A9bde4Ee9e77D5393D) | Cross-asset adapter — swaps USDT0 ↔ USDC into Morpho USDC vaults |
| **GoalySettlement** | [`0xC03BB9526D6F0308d8Ba0831e85f93db3E45e201`](https://arbiscan.io/address/0xC03BB9526D6F0308d8Ba0831e85f93db3E45e201) | Optimistic settlement oracle — bonded propose → dispute window → finalize |
| **ReserveManager** | [`0xCe34457F70733191126726c1D1EeEb52Bcd20051`](https://arbiscan.io/address/0xCe34457F70733191126726c1D1EeEb52Bcd20051) | Bridges surplus only (never principal) cross-chain as USDC via Circle CCTP |

Players always stake and withdraw USDT; internally the vault's yield can be earned in USDT0 or USDC.
Contract source lives in its own repo, [Goaly-Protocol/contracts](https://github.com/Goaly-Protocol/contracts).

### Yield agent

The agent reads Morpho vault APYs and the vault's whitelisted strategies and can `rebalance()` the pool
toward the best risk-adjusted option. It is advisory / governance-gated — same-chain moves only, never
to an EOA — so principal always stays on Arbitrum and claims stay no-loss. It signs on its own Tether
WDK wallet; see [Built on Tether WDK](#built-on-tether-wdk).

## Repo layout

This repo is a Bun + Turborepo monorepo for the API and shared packages:

```
apps/
  api/              Bun + Hono + Drizzle API (→ api.goaly.fun)
packages/
  core/             domain logic — odds model, rebalance policy, cross-chain routing
  plugin-onchain/   viem reads/writes, Morpho data, market settlement
  plugin-odds/      football odds/results feed provider
  plugin-teams/     team / flag / crest resolution
  plugin-wdk/       Tether WDK wallet wrapper (agent + oracle signer)
```

The dApp ([app.goaly.fun](https://app.goaly.fun)), landing ([goaly.fun](https://goaly.fun)), docs
(Mintlify), and contracts each live in their own repository.

## Develop

Requires [Bun](https://bun.sh).

```bash
bun install
cp .env.example .env      # fill in ORACLE_PK, ARBITRUM_RPC_URL, odds API key, …
bun run dev               # API + packages via Turborepo
bun run test              # workspace tests
bun run typecheck
```

The API serves at http://localhost:3001 (API reference at `/docs`).

## License

Apache-2.0
