import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, encodeFunctionData, erc20Abi } from 'viem';

/** Write ABI fragment for GoalyVault.deposit. */
export const goalyVaultWriteAbi = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export interface DepositParams {
  usdt0: Address;
  vault: Address;
  amount: bigint;
}

/**
 * Approve USDT0 and deposit into GoalyVault, each transaction signed by the given self-custodial
 * wallet (e.g. a WDK-backed `WalletProvider`). Returns the approve + deposit tx hashes.
 */
export async function depositToVault(
  wallet: WalletProvider,
  params: DepositParams,
): Promise<{ approveHash: string; depositHash: string }> {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.vault, params.amount],
  });
  const approveHash = await wallet.sendTransaction({ to: params.usdt0, data: approveData });

  const depositData = encodeFunctionData({
    abi: goalyVaultWriteAbi,
    functionName: 'deposit',
    args: [params.amount],
  });
  const depositHash = await wallet.sendTransaction({ to: params.vault, data: depositData });

  return { approveHash, depositHash };
}
