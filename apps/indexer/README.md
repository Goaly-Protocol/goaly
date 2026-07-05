# @goaly/indexer

[Ponder](https://ponder.sh) indexer for the `GoalyMarkets` contract on Arbitrum One (chainId 42161).
Turns the prediction-market's on-chain events into a queryable store (SQL + auto GraphQL) powering the
app's positions / leaderboard views.

GoalyMarkets is the user-facing no-loss prediction layer: players stake USDT0 on a match outcome
(`predict`), the stake is deposited into the vault and stays redeemable 1:1, and winners split a
yield-funded prize on `claim`.

## Indexed data

| Table        | Source event(s)                  | Purpose                                                               |
| ------------ | -------------------------------- | --------------------------------------------------------------------- |
| `prediction` | `Predicted`                      | every stake placed (`marketId`, `user`, `outcome`, `stake`)           |
| `claim`      | `Claimed`                        | every payout (`marketId`, `user`, `stakeReturned`, `prize`)           |
| `market`     | `MarketCreated`, `MarketSettled` | per-market lifecycle (status, closeTime, result, prize)               |
| `user`       | `Predicted`, `Claimed`           | aggregated per-user totals (staked / prize / counts) for leaderboards |

`outcome` / `result` are the `Outcome` enum: `0 = HOME`, `1 = DRAW`, `2 = AWAY`.

## Environment

| Var                         | Purpose                         | Default                                      |
| --------------------------- | ------------------------------- | -------------------------------------------- |
| `PONDER_RPC_URL_42161`      | Arbitrum One RPC endpoint       | `https://arb1.arbitrum.io/rpc`               |
| `GOALY_MARKETS_ADDRESS`     | GoalyMarkets proxy address      | `0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3` |
| `GOALY_MARKETS_START_BLOCK` | block the contract was deployed | `480301271`                                  |

## Run

```bash
bun install
cp ../../.env .env          # optional: override the env vars above
bun run codegen             # generate types (ponder-env.d.ts)
bun run dev                 # start indexing + GraphQL at http://localhost:42069
```

Standalone package (not part of the bun workspace) — Ponder manages its own dependencies. The
`GoalyMarkets` ABI in `abis/` is copied from the compiled artifact in `@goaly/contracts`
(`out/GoalyMarkets.sol/GoalyMarkets.json`).

## Deploy

Pushed to the VPS by `.github/workflows/deploy-indexer.yml` (rsync + `pm2 restart goaly-indexer`) on
any change under `apps/indexer/**`. The VPS env must define the three vars above.
