# @goaly/plugin-wdk

Self-custodial wallet abstraction for Goaly, backed by Tether's Wallet Development Kit (WDK).

Goaly is non-custodial: players hold their own keys and sign their own deposits, predictions and claims.
This package hides key management behind one small `WalletProvider` interface so the rest of the
[Goaly](https://goaly.fun) stack signs transactions without caring how the keys are held. The production
implementation is backed by Tether's WDK (keys derive from a BIP-39 seed and stay on-device); a viem
private-key wallet drives server-side signing (the settlement oracle), and a mock powers dev and tests.

## What it does

- **One interface** — `WalletProvider`: create / import a wallet, sign messages, and send transfers or
  raw contract calls (ERC-20 approve, vault deposit), returning a tx hash.
- **`WdkWallet`** — self-custodial, backed by `@tetherto/wdk-wallet-evm`; keys derive from a seed and
  never leave the process. This is what users sign with.
- **`KeyWallet`** — a viem private-key signer for server-side roles (e.g. the oracle), with a
  locally-tracked nonce so bursts of transactions don't race the RPC.
- **`MockWallet`** — a deterministic in-memory wallet (no real keys, no network) that records sent txs.
- **Arbitrum-first** — accounts default to `eip155:42161`; amounts are USDT (USD₮0) base units.

## Usage

```ts
import { WdkWallet, type WalletProvider } from '@goaly/plugin-wdk';

const wallet: WalletProvider = new WdkWallet(process.env.SEED_PHRASE!, {
  provider: process.env.ARBITRUM_RPC_URL,
});

const account = await wallet.createWallet(); // derive from the seed
const hash = await wallet.send({ to: recipient, amount: 1_000000n, token: usdt0 }); // 1 USDT
```

## API

- **`WalletProvider`** — the wallet interface (`WalletAccount`, `SendParams`, `TxRequest`).
- **`WdkWallet`** / **`WdkWalletOptions`** — self-custodial WDK-backed wallet (user signing).
- **`KeyWallet`** / **`KeyWalletOptions`** — viem private-key wallet with nonce serialization (servers).
- **`MockWallet`** — deterministic in-memory wallet for dev/tests.

---

Internal workspace package of the Goaly monorepo — not published to npm.
