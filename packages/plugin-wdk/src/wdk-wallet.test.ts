import { describe, expect, test } from 'bun:test';
import { WdkWallet } from './wdk-wallet';

// Well-known test mnemonic (Hardhat/Anvil default) — account 0 is a canonical address.
const SEED = 'test test test test test test test test test test test junk';
const ACCOUNT0 = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

describe('WdkWallet (real @tetherto/wdk-wallet-evm)', () => {
  test('derives the canonical BIP-44 account 0 address offline', async () => {
    const wallet = new WdkWallet(SEED);
    const account = await wallet.createWallet();
    expect(account.address.toLowerCase()).toBe(ACCOUNT0);
    expect(account.chain).toBe('eip155:42161');
    expect(wallet.getAccount()?.address.toLowerCase()).toBe(ACCOUNT0);
  });

  test('import is deterministic for the same mnemonic', async () => {
    const a = await new WdkWallet(SEED).importWallet(SEED);
    const b = await new WdkWallet(SEED).importWallet(SEED);
    expect(a.address).toBe(b.address);
  });

  test('derives distinct accounts per index', async () => {
    const a0 = await new WdkWallet(SEED, { accountIndex: 0 }).createWallet();
    const a1 = await new WdkWallet(SEED, { accountIndex: 1 }).createWallet();
    expect(a0.address).not.toBe(a1.address);
  });

  test('signMessage returns a hex signature', async () => {
    const wallet = new WdkWallet(SEED);
    await wallet.createWallet();
    const sig = await wallet.signMessage('gm goaly');
    expect(sig).toMatch(/^0x[0-9a-fA-F]+$/);
  });
});
