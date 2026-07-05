# @goaly/core

Shared domain logic, types and constants for Goaly.

The pure, framework-free core of the [Goaly](https://goaly.fun) no-loss football prediction protocol on
Arbitrum. Staked USDT principal is always returned 1:1; prizes are funded only from the Morpho yield it
earns. This package is the single source of truth for money math, match/prediction rules, prize
distribution, the yield-agent rebalancing policy and on-chain addresses — imported by the Hono API, the
Next.js app, the yield agent and the on-chain plugin. It has no runtime dependencies and never touches
the network, so every rule stays deterministic and testable.

## What it does

- **Money** — fixed-point `bigint` math in USDT (USD₮0, 6 decimals). No floating point for money, ever.
- **Match & prediction** — the match lifecycle, 1X2 / exact-score picks, and grading against a result.
- **Pot** — pro-rata prize distribution among winners, minus a protocol fee (taken from the prize only).
- **Odds** — odds-boosted parimutuel prize sizing, capped by the protocol yield reserve so it stays solvent.
- **Rebalance & crosschain** — the yield agent's pure decision core: rank Morpho vaults and route funds
  cross-chain via Wormhole CCTP when the best yield lives on another chain.
- **Constants** — Arbitrum One chain config plus deployed Goaly, USD₮0 and Morpho vault addresses.

## Usage

```ts
import { parseUnits, distributePot, resolveOutcome } from '@goaly/core';

// 1X2 outcome from a final score.
resolveOutcome({ homeScore: 2, awayScore: 1 }); // "HOME"

// Split a 100 USDT prize pot among winners pro-rata by stake, after a 5% fee.
const { payouts, fee, dust } = distributePot(
  parseUnits('100'), // 100_000000n base units
  [
    { id: 'alice', stake: parseUnits('30') },
    { id: 'bob', stake: parseUnits('10') },
  ],
  500n, // feeBps (5%)
);
```

## API

- **money** — `parseUnits` / `formatUnits`, `mulDiv`, `applyBps`, `sum`, `USDT0_DECIMALS`, `BPS`.
- **match** — `Match`, `MatchResult`, `MatchStatus`, `isOpenForPredictions`, `assertValidResult`.
- **prediction** — `Outcome`, `Pick`, `Prediction`, `resolveOutcome`, `isPredictionCorrect`.
- **pot** — `distributePot`, `Payout`, `PotDistribution`, `Stake`.
- **odds** — `oddsBoostedPrize`, `OddsBoostParams`, `OddsBoostedPrize`.
- **rebalance** — `decideRebalance`, `VaultSnapshot`, `RebalanceParams`, `RebalanceDecision`.
- **crosschain** — `crossChainRoute`, `CrossChainRoute`, `WORMHOLE_CHAIN_ID`, `CCTP_CHAINS`.
- **constants** — `ARBITRUM_ONE`, `ARBITRUM` (addresses), `DEFAULT_YIELD_VAULT`, `ChainId`.

---

Internal workspace package of the Goaly monorepo — not published to npm.
