import { describe, expect, test } from 'bun:test';
import { decideRebalance, type VaultSnapshot } from './rebalance';

const GAUNTLET: VaultSnapshot = {
  address: '0x139250CdB310D657eAC506c7C7FC6AcDE34Af1ec',
  name: 'Gauntlet USDT0 Core',
  apy: 0.0172,
  tvlUsd: 121,
};
const STEAK: VaultSnapshot = {
  address: '0x2281961480216653529A03D6CE03Ee6B8cdF564E',
  name: 'Steakhouse Prime USDT0',
  apy: 0.0211,
  tvlUsd: 18,
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
});
