import type { Outcome } from '@goaly/core';
import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, type Hex, encodeFunctionData, erc20Abi } from 'viem';

/** Write ABI fragments for GoalyMarkets player actions. */
export const goalyMarketsAbi = [
  {
    type: 'function',
    name: 'predict',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'outcome', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }],
  },
] as const;

/** Solidity `enum Outcome { HOME, DRAW, AWAY }` ordering. */
const OUTCOME_INDEX: Record<Outcome, number> = { HOME: 0, DRAW: 1, AWAY: 2 };

export interface PredictParams {
  markets: Address;
  /** USDT0 token — the stake asset. */
  usdt0: Address;
  marketId: Hex;
  outcome: Outcome;
  amount: bigint;
}

/** Approve USDT0 to GoalyMarkets, then predict — the stake is deposited into the vault to earn yield. */
export async function predict(
  wallet: WalletProvider,
  params: PredictParams,
): Promise<{ approveHash: string; predictHash: string }> {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.markets, params.amount],
  });
  const approveHash = await wallet.sendTransaction({ to: params.usdt0, data: approveData });

  const predictData = encodeFunctionData({
    abi: goalyMarketsAbi,
    functionName: 'predict',
    args: [params.marketId, OUTCOME_INDEX[params.outcome], params.amount],
  });
  const predictHash = await wallet.sendTransaction({ to: params.markets, data: predictData });
  return { approveHash, predictHash };
}

export interface ClaimParams {
  markets: Address;
  marketId: Hex;
}

/** Claim a settled market — reclaim your stake (+ any prize), always paid out in USDT0. */
export async function claimPayout(wallet: WalletProvider, params: ClaimParams): Promise<string> {
  const data = encodeFunctionData({
    abi: goalyMarketsAbi,
    functionName: 'claim',
    args: [params.marketId],
  });
  return wallet.sendTransaction({ to: params.markets, data });
}
