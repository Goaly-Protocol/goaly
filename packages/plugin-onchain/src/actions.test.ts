import { MockWallet } from '@goaly/plugin-wdk';
import { describe, expect, test } from 'bun:test';
import { type Hex, decodeFunctionData } from 'viem';
import { claimPayout, goalyMarketsAbi, predict } from './actions';

const MARKETS = '0x227596cee251C775b6E532CD226b45f0AB36DAa4';
const USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const MARKET = `0x${'ab'.repeat(32)}` as Hex;

async function wallet() {
  const w = new MockWallet();
  await w.createWallet();
  return w;
}

describe('GoalyMarkets actions', () => {
  test('predict approves USDT0 then predicts', async () => {
    const w = await wallet();
    await predict(w, {
      markets: MARKETS,
      usdt0: USDT0,
      marketId: MARKET,
      outcome: 'AWAY',
      amount: 10_000_000n,
    });
    expect(w.sentTxs).toHaveLength(2);
    expect(w.sentTxs[0]?.to).toBe(USDT0); // approve the stake token
    expect(w.sentTxs[0]?.data?.startsWith('0x095ea7b3')).toBe(true);
    expect(w.sentTxs[1]?.to).toBe(MARKETS); // predict
    const decoded = decodeFunctionData({ abi: goalyMarketsAbi, data: w.sentTxs[1]?.data as Hex });
    expect(decoded.functionName).toBe('predict');
    expect(decoded.args?.[0]).toBe(MARKET);
    expect(Number(decoded.args?.[1])).toBe(2); // AWAY
    expect(decoded.args?.[2]).toBe(10_000_000n);
  });

  test('claimPayout encodes claim(marketId)', async () => {
    const w = await wallet();
    await claimPayout(w, { markets: MARKETS, marketId: MARKET });
    expect(w.sentTxs[0]?.to).toBe(MARKETS);
    const decoded = decodeFunctionData({ abi: goalyMarketsAbi, data: w.sentTxs[0]?.data as Hex });
    expect(decoded.functionName).toBe('claim');
    expect(decoded.args?.[0]).toBe(MARKET);
  });
});
