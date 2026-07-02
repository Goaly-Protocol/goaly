import { MockWallet } from '@goaly/plugin-wdk';
import { describe, expect, test } from 'bun:test';
import { type Hex, decodeFunctionData } from 'viem';
import { claimPayout, placePrediction, predictionPoolAbi, withdrawFromVault } from './actions';

const POOL = '0x227596cee251C775b6E532CD226b45f0AB36DAa4';
const VAULT = '0x811830E04753D6Ee1f4b78647a56cd005F7686dE'; // goUSDT
const MARKET = `0x${'ab'.repeat(32)}` as Hex;

async function wallet() {
  const w = new MockWallet();
  await w.createWallet();
  return w;
}

describe('vault + pool actions', () => {
  test('withdrawFromVault encodes withdraw(amount, receiver)', async () => {
    const w = await wallet();
    await withdrawFromVault(w, { vault: VAULT, amount: 50_000_000n });
    expect(w.sentTxs[0]?.to).toBe(VAULT);
    expect(w.sentTxs[0]?.data).toMatch(/^0x[0-9a-f]{136}$/); // selector + amount + receiver
  });

  test('placePrediction approves goUSDT then stakes on an outcome', async () => {
    const w = await wallet();
    await placePrediction(w, {
      pool: POOL,
      goUsdt: VAULT,
      marketId: MARKET,
      outcome: 'AWAY',
      amount: 10_000_000n,
    });
    expect(w.sentTxs).toHaveLength(2);
    expect(w.sentTxs[0]?.to).toBe(VAULT); // approve goUSDT
    expect(w.sentTxs[0]?.data?.startsWith('0x095ea7b3')).toBe(true);
    expect(w.sentTxs[1]?.to).toBe(POOL); // placePrediction
    const decoded = decodeFunctionData({ abi: predictionPoolAbi, data: w.sentTxs[1]?.data as Hex });
    expect(decoded.functionName).toBe('placePrediction');
    expect(decoded.args?.[0]).toBe(MARKET);
    expect(Number(decoded.args?.[1])).toBe(2); // AWAY
    expect(decoded.args?.[2]).toBe(10_000_000n);
  });

  test('claimPayout encodes claim(marketId)', async () => {
    const w = await wallet();
    await claimPayout(w, { pool: POOL, marketId: MARKET });
    expect(w.sentTxs[0]?.to).toBe(POOL);
    const decoded = decodeFunctionData({ abi: predictionPoolAbi, data: w.sentTxs[0]?.data as Hex });
    expect(decoded.functionName).toBe('claim');
    expect(decoded.args?.[0]).toBe(MARKET);
  });
});
