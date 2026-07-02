import { describe, expect, test } from 'bun:test';
import type { Address, PublicClient } from 'viem';
import { YieldAgentService } from '../src/services/yield-agent.service';

const GAUNTLET = '0x139250CdB310D657eAC506c7C7FC6AcDE34Af1ec';
const STEAK = '0x2281961480216653529A03D6CE03Ee6B8cdF564E';

const morphoFetch = (async () => ({
  ok: true,
  json: async () => ({
    data: {
      vaults: {
        items: [
          {
            address: GAUNTLET,
            name: 'Gauntlet USDT0 Core',
            state: { netApy: 0.0172, totalAssetsUsd: 121 },
          },
          {
            address: STEAK,
            name: 'Steakhouse Prime USDT0',
            state: { netApy: 0.0211, totalAssetsUsd: 18 },
          },
        ],
      },
    },
  }),
})) as unknown as typeof fetch;

const clientAt = (current: string): PublicClient =>
  ({ readContract: async () => current }) as unknown as PublicClient;

describe('YieldAgentService', () => {
  test('advises a rebalance to the higher-APY vault without executing', async () => {
    const agent = new YieldAgentService({
      client: clientAt(GAUNTLET),
      vault: '0xVault' as Address,
      candidateVaults: [GAUNTLET as Address, STEAK as Address],
      params: { minApyGainBps: 30, minTvlUsd: 10 },
      fetchFn: morphoFetch,
    });
    const status = await agent.run(false);
    expect(status.currentVault).toBe(GAUNTLET);
    expect(status.current?.name).toBe('Gauntlet USDT0 Core');
    expect(status.decision?.shouldRebalance).toBe(true);
    expect(status.decision?.to?.name).toBe('Steakhouse Prime USDT0');
    expect(status.lastTxHash).toBeNull();
    expect(status.canExecute).toBe(false);
  });

  test('executes the migration when asked and a wallet is present', async () => {
    const wallet = { sendTransaction: async () => '0xtxhash' };
    const agent = new YieldAgentService({
      client: clientAt(GAUNTLET),
      vault: '0xVault' as Address,
      candidateVaults: [GAUNTLET as Address, STEAK as Address],
      params: { minApyGainBps: 30, minTvlUsd: 10 },
      wallet: wallet as never,
      fetchFn: morphoFetch,
    });
    const status = await agent.run(true);
    expect(status.lastTxHash).toBe('0xtxhash');
    expect(status.canExecute).toBe(true);
  });
});
