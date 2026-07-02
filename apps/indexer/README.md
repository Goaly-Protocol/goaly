# @goaly/indexer

[Ponder](https://ponder.sh) indexer for the `GoalyVault` contract on Arbitrum. Turns on-chain
events into a queryable store (SQL + auto GraphQL) powering the app's positions/leaderboard views.

## Indexed data

| Table        | Source event     | Purpose                                                  |
| ------------ | ---------------- | -------------------------------------------------------- |
| `deposit`    | `Deposited`      | every principal deposit                                  |
| `withdrawal` | `Withdrawn`      | every principal withdrawal                               |
| `debtCharge` | `DebtCharged`    | prediction credit charged to a user                      |
| `account`    | all of the above | aggregated per-user position (principal / shares / debt) |

## Run

```bash
bun install
cp ../../.env .env          # needs PONDER_RPC_URL_42161, GOALY_VAULT_ADDRESS, GOALY_VAULT_START_BLOCK
bun run codegen             # generate types (ponder-env.d.ts)
bun run dev                 # start indexing + GraphQL at http://localhost:42069
```

Standalone package (not part of the bun workspace) — Ponder manages its own dependencies. The
`GoalyVault` ABI in `abis/` is generated from the compiled artifact in `@goaly/contracts`. Until the
vault is deployed and `GOALY_VAULT_ADDRESS` is set, the indexer runs but has nothing to index.
