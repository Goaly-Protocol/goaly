import { describe, expect, test } from 'bun:test';
import { KeyWallet } from './key-wallet';

// Anvil/Hardhat account 0 private key → address 0xf39F…92266 (deterministic, offline).
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const ADDRESS = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

describe('KeyWallet', () => {
  test('derives the address from the private key (offline)', async () => {
    const wallet = new KeyWallet(KEY);
    const account = await wallet.createWallet();
    expect(account.address.toLowerCase()).toBe(ADDRESS);
    expect(account.chain).toBe('eip155:42161');
    expect(wallet.getAccount()?.address.toLowerCase()).toBe(ADDRESS);
  });

  test('signMessage returns a hex signature', async () => {
    const sig = await new KeyWallet(KEY).signMessage('gm goaly');
    expect(sig).toMatch(/^0x[0-9a-fA-F]+$/);
  });
});
