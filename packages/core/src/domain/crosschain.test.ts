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
const ARB_USDC: VaultSnapshot = {
  ...ARB_USDT0,
  asset: 'USDC',
  assetAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
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

describe('crossChainRoute (Wormhole)', () => {
  test('swaps into USDC, bridges via Wormhole CCTP, then deposits (cross-token source)', () => {
    const route = crossChainRoute(ARB_USDT0, BASE_USDC);
    expect(route).not.toBeNull();
    expect(route?.wormholeChainId).toBe(30); // Base
    expect(route?.protocol).toContain('CCTP');
    expect(route?.supported).toBe(true);
    expect(route?.steps.map((s) => s.action)).toEqual(['Swap', 'Bridge', 'Deposit']);
  });

  test('USDC → USDC needs no swaps — just the Wormhole bridge + deposit', () => {
    const route = crossChainRoute(ARB_USDC, BASE_USDC);
    expect(route?.steps.map((s) => s.action)).toEqual(['Bridge', 'Deposit']);
  });

  test('returns null for a same-chain target (no bridge needed)', () => {
    expect(
      crossChainRoute(ARB_USDT0, { ...BASE_USDC, chainId: 42161, chain: 'arbitrum' }),
    ).toBeNull();
  });
});
