# Examples

Runnable demos of the Goaly stack.

## `end-to-end.ts`

Derives a self-custodial **WDK** wallet, reads its **live GoalyVault** position on Arbitrum, and
dry-runs a deposit (encodes `approve` + `deposit` without broadcasting):

```bash
bun examples/end-to-end.ts
```

Env (all optional): `ARBITRUM_RPC_URL`, `GOALY_VAULT_ADDRESS`, `DEMO_SEED`. Reads are safe — no funds
are moved. To actually deposit, swap the `MockWallet` for a funded `WdkWallet` and call the same
`depositToVault(...)`.
