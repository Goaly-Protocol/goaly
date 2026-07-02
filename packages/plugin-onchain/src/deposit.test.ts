import { MockWallet } from '@goaly/plugin-wdk';
import { describe, expect, test } from 'bun:test';
import { depositToVault } from './deposit';

const USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const VAULT = '0x30042f0225fc513ba22551afcd8d3a88d3e128d1';

describe('depositToVault', () => {
  test('approves USDT0 then deposits into the vault, both signed by the wallet', async () => {
    const wallet = new MockWallet();
    await wallet.createWallet();

    const { approveHash, depositHash } = await depositToVault(wallet, {
      usdt0: USDT0,
      vault: VAULT,
      amount: 100_000_000n, // 100 USDT0
    });

    expect(wallet.sentTxs).toHaveLength(2);
    // 1) ERC-20 approve(spender=vault, amount) to the USDT0 token
    expect(wallet.sentTxs[0]?.to).toBe(USDT0);
    expect(wallet.sentTxs[0]?.data?.startsWith('0x095ea7b3')).toBe(true);
    // 2) deposit(uint256) to the vault (4-byte selector + one 32-byte arg = 36 bytes)
    expect(wallet.sentTxs[1]?.to).toBe(VAULT);
    expect(wallet.sentTxs[1]?.data).toMatch(/^0x[0-9a-f]{72}$/);

    expect(approveHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(depositHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(approveHash).not.toBe(depositHash);
  });
});
