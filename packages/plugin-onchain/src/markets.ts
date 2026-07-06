import type { Outcome } from '@goaly/core';
import type { Address, Hex, PublicClient } from 'viem';

/** Read ABI for GoalyMarkets — the `markets(bytes32)` getter returns the full Market struct. */
export const goalyMarketsReadAbi = [
  {
    type: 'function',
    name: 'markets',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'closeTime', type: 'uint64' },
          { name: 'status', type: 'uint8' },
          { name: 'result', type: 'uint8' },
          { name: 'totalStake', type: 'uint256' },
          { name: 'winningStake', type: 'uint256' },
          { name: 'prize', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

/** On-chain market lifecycle (mirrors `enum Status { NONE, OPEN, SETTLED }`). */
export type MarketStatus = 'NONE' | 'OPEN' | 'SETTLED';

const STATUS_BY_INDEX: readonly MarketStatus[] = ['NONE', 'OPEN', 'SETTLED'];
const OUTCOME_BY_INDEX: readonly Outcome[] = ['HOME', 'DRAW', 'AWAY'];

/** A decoded on-chain market (the GoalyMarkets `Market` struct, humanised). */
export interface OnchainMarket {
  closeTime: bigint;
  status: MarketStatus;
  result: Outcome;
  totalStake: bigint;
  winningStake: bigint;
  prize: bigint;
}

/** Read a market's full on-chain state. A never-created market reads back as all-zero → `NONE`. */
export async function readMarket(
  client: PublicClient,
  params: { markets: Address; marketId: Hex },
): Promise<OnchainMarket> {
  const raw = await client.readContract({
    address: params.markets,
    abi: goalyMarketsReadAbi,
    functionName: 'markets',
    args: [params.marketId],
  });
  return {
    closeTime: raw.closeTime,
    status: STATUS_BY_INDEX[raw.status] ?? 'NONE',
    result: OUTCOME_BY_INDEX[raw.result] ?? 'HOME',
    totalStake: raw.totalStake,
    winningStake: raw.winningStake,
    prize: raw.prize,
  };
}

/** Convenience: just the on-chain lifecycle status of a market. */
export async function readMarketStatus(
  client: PublicClient,
  params: { markets: Address; marketId: Hex },
): Promise<MarketStatus> {
  return (await readMarket(client, params)).status;
}
