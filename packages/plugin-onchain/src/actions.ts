import type { Outcome } from '@goaly/core';
import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, type Hex, encodeFunctionData } from 'viem';

/** Write ABI fragment for GoalyVault.withdraw. */
export const goalyVaultActionsAbi = [
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** Write ABI fragments for PredictionPool user actions. */
export const predictionPoolAbi = [
  {
    type: 'function',
    name: 'placePrediction',
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
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** Solidity `enum Outcome { HOME, DRAW, AWAY }` ordering. */
const OUTCOME_INDEX: Record<Outcome, number> = { HOME: 0, DRAW: 1, AWAY: 2 };

/** Withdraw principal from GoalyVault (unlocks only once yield has cleared the debt). */
export async function withdrawFromVault(
  wallet: WalletProvider,
  params: { vault: Address },
): Promise<string> {
  const data = encodeFunctionData({ abi: goalyVaultActionsAbi, functionName: 'withdraw' });
  return wallet.sendTransaction({ to: params.vault, data });
}

export interface PlacePredictionParams {
  pool: Address;
  marketId: Hex;
  outcome: Outcome;
  amount: bigint;
}

/** Place a prediction (borrows credit via the vault) — signed by the user's wallet. */
export async function placePrediction(
  wallet: WalletProvider,
  params: PlacePredictionParams,
): Promise<string> {
  const data = encodeFunctionData({
    abi: predictionPoolAbi,
    functionName: 'placePrediction',
    args: [params.marketId, OUTCOME_INDEX[params.outcome], params.amount],
  });
  return wallet.sendTransaction({ to: params.pool, data });
}

/** Claim a settled market's payout. */
export async function claimPayout(
  wallet: WalletProvider,
  params: { pool: Address; marketId: Hex },
): Promise<string> {
  const data = encodeFunctionData({
    abi: predictionPoolAbi,
    functionName: 'claim',
    args: [params.marketId],
  });
  return wallet.sendTransaction({ to: params.pool, data });
}
