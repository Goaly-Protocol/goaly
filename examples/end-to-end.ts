/**
 * Runnable end-to-end demo: derive a self-custodial WDK wallet, read its live goUSDT balance on
 * Arbitrum, and dry-run a deposit (encode approve + deposit without broadcasting).
 *
 *   bun examples/end-to-end.ts
 *
 * Env: ARBITRUM_RPC_URL (optional), GOALY_VAULT_ADDRESS (optional), DEMO_SEED (optional).
 */
import { ARBITRUM } from '@goaly/core';
import { createArbitrumClient, depositToVault, readGoUsdtBalance } from '@goaly/plugin-onchain';
import { MockWallet, WdkWallet } from '@goaly/plugin-wdk';

const RPC = process.env.ARBITRUM_RPC_URL ?? 'https://arb1.arbitrum.io/rpc';
const VAULT = (process.env.GOALY_VAULT_ADDRESS ?? ARBITRUM.goaly.vault) as `0x${string}`;
const USDT0 = ARBITRUM.usdt0 as `0x${string}`;
const SEED = process.env.DEMO_SEED ?? 'test test test test test test test test test test test junk';

async function main() {
  // 1) Self-custodial WDK wallet — keys derived from a BIP-39 seed, on device.
  const wallet = new WdkWallet(SEED, { provider: RPC });
  const account = await wallet.createWallet();
  console.log('1) WDK wallet address:', account.address);

  // 2) Read the live goUSDT balance (= redeemable USDT0 principal).
  const client = createArbitrumClient(RPC);
  const goUsdt = await readGoUsdtBalance(client, VAULT, account.address as `0x${string}`);
  console.log('2) Live goUSDT balance:', goUsdt.toString());

  // 3) Dry-run a 100 USDT0 deposit — capture the encoded txs without broadcasting.
  const dryRun = new MockWallet();
  await dryRun.createWallet();
  await depositToVault(dryRun, { usdt0: USDT0, vault: VAULT, amount: 100_000_000n });
  console.log('3) A deposit would sign + send:');
  for (const tx of dryRun.sentTxs) {
    console.log(`   → to ${tx.to}  data ${tx.data?.slice(0, 10)}…`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
