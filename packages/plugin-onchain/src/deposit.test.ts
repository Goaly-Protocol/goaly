import { MockWallet } from '@goaly/plugin-wdk';
import { describe, expect, test } from 'bun:test';
import { depositToVault } from './deposit';

const USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const VAULT = '0x811830E04753D6Ee1f4b78647a56cd005F7686dE';

describe('depositToVault', () => {
  test('approves USDT0 then deposits, minting goUSDT to the wallet', async () => {
    const wallet = new MockWallet();
    await wallet.createWallet();

    const { approveHash, depositHash } = await depositToVault(wallet, {
      usdt0: USDT0,
      vault: VAULT,
      amount: 100_000_000n, // 100 USDT0
    });

    expect(wallet.sentTxs).toHaveLength(2);
    expect(wallet.sentTxs[0]?.to).toBe(USDT0);
    expect(wallet.sentTxs[0]?.data?.startsWith('0x095ea7b3')).toBe(true); // approve
    expect(wallet.sentTxs[1]?.to).toBe(VAULT);
    // deposit(uint256,address): 4-byte selector + two 32-byte words
    expect(wallet.sentTxs[1]?.data).toMatch(/^0x[0-9a-f]{136}$/);
    expect(approveHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(depositHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(approveHash).not.toBe(depositHash);
  });
});
