import { describe, expect, test } from 'bun:test';
import { decideRebalance, type VaultSnapshot } from './rebalance';

const ARB_USDT0 = { chainId: 42161, chain: 'arbitrum', asset: 'USDT0' };
const GAUNTLET: VaultSnapshot = {
  address: '0x139250CdB310D657eAC506c7C7FC6AcDE34Af1ec',
  name: 'Gauntlet USDT0 Core',
  apy: 0.0172,
  tvlUsd: 121,
  ...ARB_USDT0,
};
const STEAK: VaultSnapshot = {
  address: '0x2281961480216653529A03D6CE03Ee6B8cdF564E',
  name: 'Steakhouse Prime USDT0',
  apy: 0.0211,
  tvlUsd: 18,
  ...ARB_USDT0,
};
/** A higher-APY vault on the SAME chain but a different token — reachable via an on-chain swap. */
const ARB_USDC: VaultSnapshot = {
  address: '0x7e97fa6893871A2751B5fE961978DCCb2c201E65',
  name: 'Gauntlet USDC Core',
  apy: 0.0341,
  tvlUsd: 2_540_000,
  chainId: 42161,
  chain: 'arbitrum',
  asset: 'USDC',
};
/** A higher-APY vault on another chain + token — the global best, but not directly migratable. */
const BASE_USDC: VaultSnapshot = {
  address: '0xbA5eDb105B4d2D3E6A3d3C0C1eE9C6f0F2eE1234',
  name: 'Steakhouse High Yield USDC',
  apy: 0.0867,
  tvlUsd: 4_900_000,
  chainId: 8453,
  chain: 'base',
  asset: 'USDC',
};

const PARAMS = { minApyGainBps: 30, minTvlUsd: 10 };

describe('decideRebalance', () => {
  test('migrates to a higher-APY vault that clears the risk floor', () => {
    const d = decideRebalance([GAUNTLET, STEAK], GAUNTLET.address, PARAMS);
    expect(d.shouldRebalance).toBe(true);
    expect(d.to?.name).toBe('Steakhouse Prime USDT0');
    expect(d.gainBps).toBe(39); // 2.11% - 1.72%
  });

  test('holds when the better vault is too thin (risk floor)', () => {
    // Raise the floor above Steakhouse's $18 TVL — it stops being a candidate.
    const d = decideRebalance([GAUNTLET, STEAK], GAUNTLET.address, {
      minApyGainBps: 30,
      minTvlUsd: 50,
    });
    expect(d.shouldRebalance).toBe(false);
    expect(d.to?.name).toBe('Gauntlet USDT0 Core');
    expect(d.reason).toContain('already the best');
  });

  test('holds when the APY gain is below the threshold', () => {
    const d = decideRebalance([GAUNTLET, { ...STEAK, apy: 0.0182 }], GAUNTLET.address, PARAMS);
    expect(d.shouldRebalance).toBe(false);
    expect(d.gainBps).toBe(10); // only +0.10%, below 30bps
    expect(d.reason).toContain('below');
  });

  test('is case-insensitive on the current address', () => {
    const d = decideRebalance([GAUNTLET, STEAK], GAUNTLET.address.toLowerCase(), PARAMS);
    expect(d.from?.name).toBe('Gauntlet USDT0 Core');
  });

  test('recommends a vault when the current one is unknown', () => {
    const d = decideRebalance([GAUNTLET, STEAK], '0xdead', PARAMS);
    expect(d.shouldRebalance).toBe(true);
    expect(d.from).toBeNull();
    expect(d.to?.name).toBe('Steakhouse Prime USDT0');
  });

  test('executes a cross-asset move on the same chain (higher-APY USDC vault, via swap)', () => {
    const d = decideRebalance([GAUNTLET, STEAK, ARB_USDC], GAUNTLET.address, PARAMS);
    expect(d.shouldRebalance).toBe(true);
    expect(d.to?.name).toBe('Gauntlet USDC Core'); // different token, same chain → still executable
    expect(d.crossVenue).toBe(false); // same chain, no bridge needed
  });

  test('executes same-venue but surfaces a cross-chain/token vault as the global best', () => {
    const d = decideRebalance([GAUNTLET, STEAK, BASE_USDC], GAUNTLET.address, PARAMS);
    // Executes only within its own chain + asset (Arbitrum USDT0).
    expect(d.shouldRebalance).toBe(true);
    expect(d.to?.name).toBe('Steakhouse Prime USDT0');
    // But the true best anywhere is the Base USDC vault — flagged cross-venue.
    expect(d.globalBest?.name).toBe('Steakhouse High Yield USDC');
    expect(d.crossVenue).toBe(true);
  });
});
