import type { VaultSnapshot } from '@goaly/core';
import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, encodeFunctionData, type PublicClient } from 'viem';

const MORPHO_API = 'https://blue-api.morpho.org/graphql';

interface MorphoVaultItem {
  address: string;
  name: string;
  state?: { netApy?: number; totalAssetsUsd?: number };
}

/** Live APY + TVL for the given Morpho vault addresses (Arbitrum by default). Empty on any failure. */
export async function fetchVaultSnapshots(
  addresses: string[],
  opts: { fetchFn?: typeof fetch; chainId?: number } = {},
): Promise<VaultSnapshot[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const chainId = opts.chainId ?? 42161;
  const wanted = new Set(addresses.map((a) => a.toLowerCase()));
  try {
    const res = await fetchFn(MORPHO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          'query($chainId:Int!){vaults(first:1000 where:{chainId_in:[$chainId]}){items{address name state{netApy totalAssetsUsd}}}}',
        variables: { chainId },
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { vaults?: { items?: MorphoVaultItem[] } } };
    return (json.data?.vaults?.items ?? [])
      .filter((v) => wanted.has(v.address.toLowerCase()))
      .map((v) => ({
        address: v.address,
        name: v.name,
        apy: v.state?.netApy ?? 0,
        tvlUsd: v.state?.totalAssetsUsd ?? 0,
      }));
  } catch {
    return [];
  }
}

/** GoalyVault view + MANAGER_ROLE migrate. */
export const vaultAgentAbi = [
  {
    type: 'function',
    name: 'yieldVault',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'migrateYieldVault',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newYieldVault', type: 'address' }],
    outputs: [],
  },
] as const;

/** The Morpho vault currently backing goUSDT. */
export async function readYieldVault(client: PublicClient, vault: Address): Promise<Address> {
  return client.readContract({ address: vault, abi: vaultAgentAbi, functionName: 'yieldVault' });
}

/** Migrate the vault's backing to `newYieldVault` (agent wallet, MANAGER_ROLE). */
export async function migrateYieldVault(
  wallet: WalletProvider,
  params: { vault: Address; newYieldVault: Address },
): Promise<string> {
  const data = encodeFunctionData({
    abi: vaultAgentAbi,
    functionName: 'migrateYieldVault',
    args: [params.newYieldVault],
  });
  return wallet.sendTransaction({ to: params.vault, data });
}
