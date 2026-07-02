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
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'fundPrize',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
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
  params: { pool: Address; marketId: Hex; closeTime: bigint },
): Promise<string> {
  const data = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'createMarket',
    args: [params.marketId, params.closeTime],
  });
  return wallet.sendTransaction({ to: params.pool, data });
}

/** Settle a finished market with its result (ORACLE_ROLE). */
export async function settleMarket(
  wallet: WalletProvider,
  params: { pool: Address; marketId: Hex; result: Outcome },
): Promise<string> {
  const data = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'settleMarket',
    args: [params.marketId, OUTCOME_INDEX[params.result]],
  });
  return wallet.sendTransaction({ to: params.pool, data });
}

/** Fund a market's prize from yield: approve USDT0 then `fundPrize`. */
export async function fundPrize(
  wallet: WalletProvider,
  params: { pool: Address; usdt0: Address; marketId: Hex; amount: bigint },
): Promise<{ approveHash: string; fundHash: string }> {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.pool, params.amount],
  });
  const approveHash = await wallet.sendTransaction({ to: params.usdt0, data: approveData });

  const fundData = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'fundPrize',
    args: [params.marketId, params.amount],
  });
  const fundHash = await wallet.sendTransaction({ to: params.pool, data: fundData });
  return { approveHash, fundHash };
}
