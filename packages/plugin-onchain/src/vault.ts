import type { Address, PublicClient } from 'viem';

/** Minimal read ABI for GoalyVault (see @goaly/contracts). */
export const goalyVaultAbi = [
  {
    type: 'function',
    name: 'principalOf',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'debtOf',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'yieldOf',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export interface VaultReads {
  principal: bigint;
  debt: bigint;
  yieldAccrued: bigint;
}

/** Read a user's raw vault account (principal, debt, accrued yield) on-chain. */
export async function readVaultAccount(
  client: PublicClient,
  vault: Address,
  user: Address,
): Promise<VaultReads> {
  const [principal, debt, yieldAccrued] = await Promise.all([
    client.readContract({
      address: vault,
      abi: goalyVaultAbi,
      functionName: 'principalOf',
      args: [user],
    }),
    client.readContract({
      address: vault,
      abi: goalyVaultAbi,
      functionName: 'debtOf',
      args: [user],
    }),
    client.readContract({
      address: vault,
      abi: goalyVaultAbi,
      functionName: 'yieldOf',
      args: [user],
    }),
  ]);
  return { principal, debt, yieldAccrued };
}
