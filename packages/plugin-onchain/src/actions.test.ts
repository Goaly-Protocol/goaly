import { MockWallet } from '@goaly/plugin-wdk';
import { describe, expect, test } from 'bun:test';
import { type Hex, decodeFunctionData } from 'viem';
import { claimPayout, placePrediction, predictionPoolAbi, withdrawFromVault } from './actions';

const POOL = '0x9d77f5e1d5afe5258ca16f808dc5ba1e9f68437f';
const VAULT = '0x30042f0225fc513ba22551afcd8d3a88d3e128d1';
const MARKET = `0x${'ab'.repeat(32)}` as Hex;

async function wallet() {
  const w = new MockWallet();
  await w.createWallet();
  return w;
}

describe('vault + pool actions', () => {
  test('withdrawFromVault encodes withdraw() to the vault', async () => {
    const w = await wallet();
    await withdrawFromVault(w, { vault: VAULT });
    expect(w.sentTxs[0]?.to).toBe(VAULT);
    expect(w.sentTxs[0]?.data).toMatch(/^0x[0-9a-f]{8}$/); // 4-byte selector, no args
  });

  test('placePrediction encodes (marketId, outcome, amount) to the pool', async () => {
    const w = await wallet();
    await placePrediction(w, { pool: POOL, marketId: MARKET, outcome: 'AWAY', amount: 5_000_000n });
    expect(w.sentTxs[0]?.to).toBe(POOL);
    const decoded = decodeFunctionData({ abi: predictionPoolAbi, data: w.sentTxs[0]?.data as Hex });
    expect(decoded.functionName).toBe('placePrediction');
    expect(decoded.args?.[0]).toBe(MARKET);
    expect(Number(decoded.args?.[1])).toBe(2); // AWAY
    expect(decoded.args?.[2]).toBe(5_000_000n);
  });

  test('claimPayout encodes claim(marketId) to the pool', async () => {
    const w = await wallet();
    await claimPayout(w, { pool: POOL, marketId: MARKET });
    expect(w.sentTxs[0]?.to).toBe(POOL);
    const decoded = decodeFunctionData({ abi: predictionPoolAbi, data: w.sentTxs[0]?.data as Hex });
    expect(decoded.functionName).toBe('claim');
    expect(decoded.args?.[0]).toBe(MARKET);
  });
});
