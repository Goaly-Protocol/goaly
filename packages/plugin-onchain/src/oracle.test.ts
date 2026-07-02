import { MockWallet } from '@goaly/plugin-wdk';
import { describe, expect, test } from 'bun:test';
import { type Hex, decodeFunctionData } from 'viem';
import {
  createMarket,
  fundPrize,
  fundPrizeFromYield,
  marketIdFor,
  predictionPoolOracleAbi,
  settleMarket,
} from './oracle';

const POOL = '0x9d77f5e1d5afe5258ca16f808dc5ba1e9f68437f';
const USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const VAULT = '0x30042f0225fc513ba22551afcd8d3a88d3e128d1';

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
    await createMarket(w, { pool: POOL, marketId, closeTime: 1_800_000_000n });
    expect(w.sentTxs[0]?.to).toBe(POOL);
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
      pool: POOL,
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

  test('fundPrize approves USDT0 then funds the market', async () => {
    const w = await wallet();
    const { approveHash, fundHash } = await fundPrize(w, {
      pool: POOL,
      usdt0: USDT0,
      marketId: marketIdFor('m1'),
      amount: 5_000_000n,
    });
    expect(w.sentTxs).toHaveLength(2);
    expect(w.sentTxs[0]?.to).toBe(USDT0);
    expect(w.sentTxs[0]?.data?.startsWith('0x095ea7b3')).toBe(true);
    expect(w.sentTxs[1]?.to).toBe(POOL);
    const decoded = decodeFunctionData({
      abi: predictionPoolOracleAbi,
      data: w.sentTxs[1]?.data as Hex,
    });
    expect(decoded.functionName).toBe('fundPrize');
    expect(approveHash).not.toBe(fundHash);
  });

  test('fundPrizeFromYield harvests vault yield then funds the market (3 txs)', async () => {
    const w = await wallet();
    const { harvestHash, approveHash, fundHash } = await fundPrizeFromYield(w, {
      vault: VAULT,
      pool: POOL,
      usdt0: USDT0,
      marketId: marketIdFor('m1'),
      amount: 5_000_000n,
    });
    expect(w.sentTxs).toHaveLength(3);
    expect(w.sentTxs[0]?.to).toBe(VAULT); // harvestYield(address)
    expect(w.sentTxs[0]?.data).toMatch(/^0x[0-9a-f]{72}$/);
    expect(w.sentTxs[1]?.to).toBe(USDT0); // approve
    expect(w.sentTxs[2]?.to).toBe(POOL); // fundPrize
    expect(new Set([harvestHash, approveHash, fundHash]).size).toBe(3);
  });
});
