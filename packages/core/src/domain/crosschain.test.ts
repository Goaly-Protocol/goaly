import { describe, expect, test } from 'bun:test';
import { crossChainRoute } from './crosschain';
import type { VaultSnapshot } from './rebalance';

const ARB_USDT0: VaultSnapshot = {
  address: '0xaaa',
  name: 'Steakhouse USDT0',
  apy: 0.0228,
  tvlUsd: 130_000,
  chainId: 42161,
  chain: 'arbitrum',
  asset: 'USDT0',
  assetAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
};
const BASE_USDC: VaultSnapshot = {
  address: '0xbbb',
  name: 'Steakhouse High Yield USDC',
  apy: 0.0884,
  tvlUsd: 4_900_000,
  chainId: 8453,
  chain: 'base',
  asset: 'USDC',
  assetAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

describe('crossChainRoute', () => {
  test('routes bridge → swap → deposit for a cross-chain, cross-token target', () => {
    const route = crossChainRoute(ARB_USDT0, BASE_USDC);
    expect(route).not.toBeNull();
    expect(route?.dstEid).toBe(30184); // Base
    expect(route?.steps.map((s) => s.action)).toEqual(['Bridge', 'Swap', 'Deposit']);
  });

  test('omits the swap step when the destination asset is also USDT0', () => {
    const route = crossChainRoute(ARB_USDT0, { ...BASE_USDC, asset: 'USDT0' });
    expect(route?.steps.map((s) => s.action)).toEqual(['Bridge', 'Deposit']);
  });

  test('returns null for a same-chain target (no bridge needed)', () => {
    expect(
      crossChainRoute(ARB_USDT0, { ...BASE_USDC, chainId: 42161, chain: 'arbitrum' }),
    ).toBeNull();
  });
});
