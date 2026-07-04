import type { Outcome } from '@goaly/core';
import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, type Hex, encodeFunctionData, erc20Abi, keccak256, toHex } from 'viem';

/** Write ABI fragments for PredictionPool oracle/admin actions. */
export const predictionPoolOracleAbi = [
  {
    type: 'function',
    name: 'createMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'closeTime', type: 'uint64' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settleMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'result', type: 'uint8' },
      { name: 'winningOddsBps', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'fundReserve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'harvestYield',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const OUTCOME_INDEX: Record<Outcome, number> = { HOME: 0, DRAW: 1, AWAY: 2 };

/** Deterministic on-chain market id derived from an off-chain match id. */
export function marketIdFor(matchId: string): Hex {
  return keccak256(toHex(matchId));
}

/** Open a market for a match (ORACLE_ROLE). */
export async function createMarket(
  wallet: WalletProvider,
  params: { markets: Address; marketId: Hex; closeTime: bigint },
): Promise<string> {
  const data = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'createMarket',
    args: [params.marketId, params.closeTime],
  });
  return wallet.sendTransaction({ to: params.markets, data });
}

/**
 * Settle a finished market with its result + the winning outcome's decimal odds ×10_000 (ORACLE_ROLE).
 * Omit / pass 10_000 (1.00) for no odds boost.
 */
export async function settleMarket(
  wallet: WalletProvider,
  params: { markets: Address; marketId: Hex; result: Outcome; winningOddsBps?: bigint },
): Promise<string> {
  const data = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'settleMarket',
    args: [params.marketId, OUTCOME_INDEX[params.result], params.winningOddsBps ?? 10_000n],
  });
  return wallet.sendTransaction({ to: params.markets, data });
}

/** Top up the odds-boost reserve: approve USDT0 then fundReserve (from harvested yield). */
export async function fundReserve(
  wallet: WalletProvider,
  params: { markets: Address; usdt0: Address; amount: bigint },
): Promise<{ approveHash: string; fundHash: string }> {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.markets, params.amount],
  });
  const approveHash = await wallet.sendTransaction({ to: params.usdt0, data: approveData });

  const fundData = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'fundReserve',
    args: [params.amount],
  });
  const fundHash = await wallet.sendTransaction({ to: params.markets, data: fundData });
  return { approveHash, fundHash };
}

/** Move the vault's accrued surplus into the prize/boost reserve (ORACLE_ROLE). */
export async function harvestYield(
  wallet: WalletProvider,
  params: { markets: Address },
): Promise<string> {
  const data = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'harvestYield',
    args: [],
  });
  return wallet.sendTransaction({ to: params.markets, data });
}
