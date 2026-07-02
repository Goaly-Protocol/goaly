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

/**
 * Settle a finished market with its result + the winning outcome's decimal odds ×10_000 (ORACLE_ROLE).
 * Omit / pass 10_000 (1.00) for no odds boost.
 */
export async function settleMarket(
  wallet: WalletProvider,
  params: { pool: Address; marketId: Hex; result: Outcome; winningOddsBps?: bigint },
): Promise<string> {
  const data = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'settleMarket',
    args: [params.marketId, OUTCOME_INDEX[params.result], params.winningOddsBps ?? 10_000n],
  });
  return wallet.sendTransaction({ to: params.pool, data });
}

/** Top up the odds-boost reserve: approve USDT0 then fundReserve (from harvested yield). */
export async function fundReserve(
  wallet: WalletProvider,
  params: { pool: Address; usdt0: Address; amount: bigint },
): Promise<{ approveHash: string; fundHash: string }> {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.pool, params.amount],
  });
  const approveHash = await wallet.sendTransaction({ to: params.usdt0, data: approveData });

  const fundData = encodeFunctionData({
    abi: predictionPoolOracleAbi,
    functionName: 'fundReserve',
    args: [params.amount],
  });
  const fundHash = await wallet.sendTransaction({ to: params.pool, data: fundData });
  return { approveHash, fundHash };
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

/** Write ABI fragment for GoalyVault.harvestYield (admin harvest of protocol yield). */
export const goalyVaultAdminAbi = [
  {
    type: 'function',
    name: 'harvestYield',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** Harvest accrued protocol yield from the vault to `to` (vault admin only). */
export async function harvestYield(
  wallet: WalletProvider,
  params: { vault: Address; to: Address },
): Promise<string> {
  const data = encodeFunctionData({
    abi: goalyVaultAdminAbi,
    functionName: 'harvestYield',
    args: [params.to],
  });
  return wallet.sendTransaction({ to: params.vault, data });
}

/**
 * Close the loop: harvest protocol yield from the vault to the caller, then use it to fund a
 * market's prize. Requires the wallet to hold GoalyVault admin + be able to fund the pool
 * (the deployer holds both by default). Returns all three tx hashes.
 */
export async function fundPrizeFromYield(
  wallet: WalletProvider,
  params: { vault: Address; pool: Address; usdt0: Address; marketId: Hex; amount: bigint },
): Promise<{ harvestHash: string; approveHash: string; fundHash: string }> {
  const account = wallet.getAccount();
  if (!account)
    throw new Error('fundPrizeFromYield: wallet has no account (call createWallet first)');
  const harvestHash = await harvestYield(wallet, {
    vault: params.vault,
    to: account.address as Address,
  });
  const { approveHash, fundHash } = await fundPrize(wallet, {
    pool: params.pool,
    usdt0: params.usdt0,
    marketId: params.marketId,
    amount: params.amount,
  });
  return { harvestHash, approveHash, fundHash };
}
