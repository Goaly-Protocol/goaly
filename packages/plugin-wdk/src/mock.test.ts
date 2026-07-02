import { describe, expect, test } from 'bun:test';
import { MockWallet } from './mock';

describe('MockWallet', () => {
  test('creates an account with an address on the configured chain', async () => {
    const wallet = new MockWallet();
    const account = await wallet.createWallet();
    expect(account.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(account.chain).toBe('eip155:42161');
    expect(wallet.getAccount()).toEqual(account);
  });

  test('import is deterministic for the same mnemonic', async () => {
    const a = await new MockWallet().importWallet('test test test');
    const b = await new MockWallet().importWallet('test test test');
    expect(a.address).toBe(b.address);
  });

  test('send requires an account and returns a tx hash', async () => {
    const wallet = new MockWallet();
    await expect(wallet.send({ to: '0x00', amount: 1n })).rejects.toThrow('no account');
    await wallet.createWallet();
    const hash = await wallet.send({ to: '0x00', amount: 1_000_000n });
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
