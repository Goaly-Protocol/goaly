import type { Outcome } from '@goaly/core';
import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, type Hex, encodeFunctionData, erc20Abi } from 'viem';

/** Write ABI fragment for GoalyVault.withdraw. */
export const goalyVaultWithdrawAbi = [
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** Write ABI fragments for PredictionPool player actions. */
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
    outputs: [{ type: 'uint256' }, { type: 'uint256' }],
  },
] as const;

/** Solidity `enum Outcome { HOME, DRAW, AWAY }` ordering. */
const OUTCOME_INDEX: Record<Outcome, number> = { HOME: 0, DRAW: 1, AWAY: 2 };

/** Redeem `amount` goUSDT for USDT0 (1:1) to the wallet. */
export async function withdrawFromVault(
  wallet: WalletProvider,
  params: { vault: Address; amount: bigint },
): Promise<string> {
  const account = wallet.getAccount();
  if (!account)
    throw new Error('withdrawFromVault: wallet has no account (call createWallet first)');
  const data = encodeFunctionData({
    abi: goalyVaultWithdrawAbi,
    functionName: 'withdraw',
    args: [params.amount, account.address as Address],
  });
  return wallet.sendTransaction({ to: params.vault, data });
}

export interface PlacePredictionParams {
  pool: Address;
  /** goUSDT token address (the GoalyVault). */
  goUsdt: Address;
  marketId: Hex;
  outcome: Outcome;
  amount: bigint;
}

/** Approve goUSDT to the pool, then stake it on an outcome (no-loss). */
export async function placePrediction(
  wallet: WalletProvider,
  params: PlacePredictionParams,
): Promise<{ approveHash: string; placeHash: string }> {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.pool, params.amount],
  });
  const approveHash = await wallet.sendTransaction({ to: params.goUsdt, data: approveData });

  const placeData = encodeFunctionData({
    abi: predictionPoolAbi,
    functionName: 'placePrediction',
    args: [params.marketId, OUTCOME_INDEX[params.outcome], params.amount],
  });
  const placeHash = await wallet.sendTransaction({ to: params.pool, data: placeData });
  return { approveHash, placeHash };
}

/** Claim a settled market: reclaim staked goUSDT + any USDT0 prize. */
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
