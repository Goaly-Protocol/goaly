import { MockWallet } from '@goaly/plugin-wdk';
import { describe, expect, test } from 'bun:test';
import { type Hex, decodeFunctionData } from 'viem';
import {
  createMarket,
  fundReserve,
  harvestYield,
  marketIdFor,
  predictionPoolOracleAbi,
  settleMarket,
} from './oracle';

const MARKETS = '0x9d77f5e1d5afe5258ca16f808dc5ba1e9f68437f';
const USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

async function wallet() {
  const w = new MockWallet();
  await w.createWallet();
  return w;
}

describe('oracle actions', () => {
  test('marketIdFor is a deterministic bytes32', () => {
    expect(marketIdFor('m1')).toBe(marketIdFor('m1'));
    expect(marketIdFor('m1')).toMatch(/^0x[0-9a-f]{64}$/);
    expect(marketIdFor('m1')).not.toBe(marketIdFor('m2'));
  });

  test('createMarket encodes (marketId, closeTime)', async () => {
    const w = await wallet();
    const marketId = marketIdFor('m1');
    await createMarket(w, { markets: MARKETS, marketId, closeTime: 1_800_000_000n });
    expect(w.sentTxs[0]?.to).toBe(MARKETS);
    const decoded = decodeFunctionData({
      abi: predictionPoolOracleAbi,
      data: w.sentTxs[0]?.data as Hex,
    });
    expect(decoded.functionName).toBe('createMarket');
    expect(decoded.args?.[0]).toBe(marketId);
    expect(decoded.args?.[1]).toBe(1_800_000_000n);
  });

  test('settleMarket maps the result to the Solidity enum', async () => {
    const w = await wallet();
    await settleMarket(w, {
      markets: MARKETS,
      marketId: marketIdFor('m1'),
      result: 'HOME',
      winningOddsBps: 30_000n,
    });
    const decoded = decodeFunctionData({
      abi: predictionPoolOracleAbi,
      data: w.sentTxs[0]?.data as Hex,
    });
    expect(decoded.functionName).toBe('settleMarket');
    expect(Number(decoded.args?.[1])).toBe(0); // HOME
    expect(decoded.args?.[2]).toBe(30_000n); // odds ×10_000
  });

  test('fundReserve approves USDT0 then tops up the reserve', async () => {
    const w = await wallet();
    const { approveHash, fundHash } = await fundReserve(w, {
      markets: MARKETS,
      usdt0: USDT0,
      amount: 5_000_000n,
    });
    expect(w.sentTxs).toHaveLength(2);
    expect(w.sentTxs[0]?.to).toBe(USDT0);
    expect(w.sentTxs[0]?.data?.startsWith('0x095ea7b3')).toBe(true);
    expect(w.sentTxs[1]?.to).toBe(MARKETS);
    const decoded = decodeFunctionData({
      abi: predictionPoolOracleAbi,
      data: w.sentTxs[1]?.data as Hex,
    });
    expect(decoded.functionName).toBe('fundReserve');
    expect(approveHash).not.toBe(fundHash);
  });

  test('harvestYield encodes the no-arg harvest on markets', async () => {
    const w = await wallet();
    await harvestYield(w, { markets: MARKETS });
    expect(w.sentTxs[0]?.to).toBe(MARKETS);
    const decoded = decodeFunctionData({
      abi: predictionPoolOracleAbi,
      data: w.sentTxs[0]?.data as Hex,
    });
    expect(decoded.functionName).toBe('harvestYield');
  });
});
