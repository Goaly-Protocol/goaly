import type { Outcome } from '@goaly/core';
import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, type Hex, encodeFunctionData, erc20Abi } from 'viem';

/** Write ABI fragments for GoalyPool player actions. */
export const goalyPoolAbi = [
  {
    type: 'function',
    name: 'placePrediction',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'outcome', type: 'uint8' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'minStake', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'outToken', type: 'address' },
      { name: 'minOut', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }],
  },
] as const;

/** Solidity `enum Outcome { HOME, DRAW, AWAY }` ordering. */
const OUTCOME_INDEX: Record<Outcome, number> = { HOME: 0, DRAW: 1, AWAY: 2 };

export interface PlacePredictionParams {
  pool: Address;
  /** Stake token the player pays with (USDT0 / USDC / USDT). */
  token: Address;
  marketId: Hex;
  outcome: Outcome;
  amount: bigint;
  /** Minimum USDT0 stake after the token→USDT0 swap (slippage guard). */
  minStake?: bigint;
}

/** Approve the stake token to the pool, then predict — the pool normalises it to USDT0 + earns yield. */
export async function placePrediction(
  wallet: WalletProvider,
  params: PlacePredictionParams,
): Promise<{ approveHash: string; placeHash: string }> {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.pool, params.amount],
  });
  const approveHash = await wallet.sendTransaction({ to: params.token, data: approveData });

  const placeData = encodeFunctionData({
    abi: goalyPoolAbi,
    functionName: 'placePrediction',
    args: [
      params.marketId,
      OUTCOME_INDEX[params.outcome],
      params.token,
      params.amount,
      params.minStake ?? 0n,
    ],
  });
  const placeHash = await wallet.sendTransaction({ to: params.pool, data: placeData });
  return { approveHash, placeHash };
}

export interface ClaimParams {
  pool: Address;
  marketId: Hex;
  /** Token to receive the stake (+ prize) in — USDT0 / USDC / USDT. */
  outToken: Address;
  minOut?: bigint;
}

/** Claim a settled market: reclaim your stake (+ any prize), paid out in `outToken`. */
export async function claimPayout(wallet: WalletProvider, params: ClaimParams): Promise<string> {
  const data = encodeFunctionData({
    abi: goalyPoolAbi,
    functionName: 'claim',
    args: [params.marketId, params.outToken, params.minOut ?? 0n],
  });
  return wallet.sendTransaction({ to: params.pool, data });
}
