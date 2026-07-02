import type { Address, PublicClient } from 'viem';

/** Read ABI for GoalyVault (goUSDT ERC-20 + pool views). */
export const goalyVaultAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalAssets',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'accruedYield',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** A user's goUSDT balance — their redeemable USDT0 principal (1:1). */
export async function readGoUsdtBalance(
  client: PublicClient,
  vault: Address,
  user: Address,
): Promise<bigint> {
  return client.readContract({
    address: vault,
    abi: goalyVaultAbi,
    functionName: 'balanceOf',
    args: [user],
  });
}

/** Protocol yield currently accrued in the vault (harvestable to fund prizes). */
export async function readAccruedYield(client: PublicClient, vault: Address): Promise<bigint> {
  return client.readContract({ address: vault, abi: goalyVaultAbi, functionName: 'accruedYield' });
}
