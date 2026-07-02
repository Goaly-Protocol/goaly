import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, encodeFunctionData, erc20Abi } from 'viem';

/** Write ABI fragment for GoalyVault.deposit. */
export const goalyVaultDepositAbi = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export interface DepositParams {
  usdt0: Address;
  vault: Address;
  amount: bigint;
}

/**
 * Approve USDT0 and deposit into GoalyVault, minting goUSDT (1:1) to the wallet — each transaction
 * signed by the given self-custodial wallet (e.g. WDK).
 */
export async function depositToVault(
  wallet: WalletProvider,
  params: DepositParams,
): Promise<{ approveHash: string; depositHash: string }> {
  const account = wallet.getAccount();
  if (!account) throw new Error('depositToVault: wallet has no account (call createWallet first)');

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.vault, params.amount],
  });
  const approveHash = await wallet.sendTransaction({ to: params.usdt0, data: approveData });

  const depositData = encodeFunctionData({
    abi: goalyVaultDepositAbi,
    functionName: 'deposit',
    args: [params.amount, account.address as Address],
  });
  const depositHash = await wallet.sendTransaction({ to: params.vault, data: depositData });
  return { approveHash, depositHash };
}
