import { MockWallet } from '@goaly/plugin-wdk';
import { describe, expect, test } from 'bun:test';
import { type Hex, decodeFunctionData } from 'viem';
import { claimPayout, goalyPoolAbi, placePrediction } from './actions';

const POOL = '0x227596cee251C775b6E532CD226b45f0AB36DAa4';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const MARKET = `0x${'ab'.repeat(32)}` as Hex;

async function wallet() {
  const w = new MockWallet();
  await w.createWallet();
  return w;
}

describe('GoalyPool actions', () => {
  test('placePrediction approves the stake token then predicts with it', async () => {
    const w = await wallet();
    await placePrediction(w, {
      pool: POOL,
      token: USDC,
      marketId: MARKET,
      outcome: 'AWAY',
      amount: 10_000_000n,
      minStake: 9_900_000n,
    });
    expect(w.sentTxs).toHaveLength(2);
    expect(w.sentTxs[0]?.to).toBe(USDC); // approve the stake token
    expect(w.sentTxs[0]?.data?.startsWith('0x095ea7b3')).toBe(true);
    expect(w.sentTxs[1]?.to).toBe(POOL); // placePrediction
    const decoded = decodeFunctionData({ abi: goalyPoolAbi, data: w.sentTxs[1]?.data as Hex });
    expect(decoded.functionName).toBe('placePrediction');
    expect(decoded.args?.[0]).toBe(MARKET);
    expect(Number(decoded.args?.[1])).toBe(2); // AWAY
    expect(decoded.args?.[2]).toBe(USDC);
    expect(decoded.args?.[3]).toBe(10_000_000n);
    expect(decoded.args?.[4]).toBe(9_900_000n);
  });

  test('claimPayout encodes claim(marketId, outToken, minOut)', async () => {
    const w = await wallet();
    await claimPayout(w, { pool: POOL, marketId: MARKET, outToken: USDC, minOut: 9_900_000n });
    expect(w.sentTxs[0]?.to).toBe(POOL);
    const decoded = decodeFunctionData({ abi: goalyPoolAbi, data: w.sentTxs[0]?.data as Hex });
    expect(decoded.functionName).toBe('claim');
    expect(decoded.args?.[0]).toBe(MARKET);
    expect(decoded.args?.[1]).toBe(USDC);
  });
});
