import type { VaultSnapshot } from '@goaly/core';
import type { WalletProvider } from '@goaly/plugin-wdk';
import { type Address, encodeFunctionData, type PublicClient } from 'viem';

const MORPHO_API = 'https://blue-api.morpho.org/graphql';

interface MorphoVaultItem {
  address: string;
  name: string;
  metadata?: { image?: string | null };
  chain?: { id?: number; network?: string };
  asset?: { symbol?: string; decimals?: number; address?: string };
  state?: {
    netApy?: number;
    totalAssets?: string | number;
    totalAssetsUsd?: number;
    curators?: Array<{ name?: string; image?: string }>;
  };
}

const VAULT_FIELDS =
  'address name metadata{image} chain{id network} asset{symbol decimals address} state{netApy totalAssets totalAssetsUsd curators{name image}}';

/** Chains the agent scans for yield (Morpho deployments). */
const SCAN_CHAINS = [1, 8453, 42161, 10, 137, 130]; // Ethereum, Base, Arbitrum, Optimism, Polygon, Unichain
/** Stablecoins the agent treats as eligible backing (any of these on any chain). */
const STABLE_SYMBOLS = new Set([
  'USDC',
  'USDT',
  'USDT0',
  'USD₮0',
  'USDC.E',
  'DAI',
  'USDS',
  'USDE',
  'GHO',
  'FRAX',
  'PYUSD',
  'RLUSD',
]);

function toSnapshot(v: MorphoVaultItem): VaultSnapshot {
  const decimals = v.asset?.decimals ?? 6;
  const assetAmount = v.state?.totalAssets ? Number(v.state.totalAssets) / 10 ** decimals : 0;
  const curator = v.state?.curators?.[0];
  return {
    address: v.address,
    name: v.name,
    apy: v.state?.netApy ?? 0,
    tvlUsd: v.state?.totalAssetsUsd ?? 0,
    chainId: v.chain?.id ?? 0,
    chain: v.chain?.network ?? 'unknown',
    asset: v.asset?.symbol ?? '',
    assetAddress: v.asset?.address ?? null,
    assetAmount,
    curator: curator?.name ?? null,
    curatorImage: curator?.image ?? null,
    image: v.metadata?.image ?? null,
  };
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
        query: `query($chainId:Int!){vaults(first:1000 where:{chainId_in:[$chainId]}){items{${VAULT_FIELDS}}}}`,
        variables: { chainId },
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { vaults?: { items?: MorphoVaultItem[] } } };
    return (json.data?.vaults?.items ?? [])
      .filter((v) => wanted.has(v.address.toLowerCase()))
      .map(toSnapshot);
  } catch {
    return [];
  }
}

/**
 * Scan the whole Morpho stablecoin landscape across chains, ranked by APY. This is what makes the
 * agent cross-chain + cross-token aware: it sees the best yield anywhere, not just its own vault's
 * chain/asset. Filters to sane stablecoin vaults above a TVL floor; empty on any failure.
 */
export async function fetchStablecoinVaults(
  opts: { fetchFn?: typeof fetch; chains?: number[]; minTvlUsd?: number; limit?: number } = {},
): Promise<VaultSnapshot[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const chains = opts.chains ?? SCAN_CHAINS;
  const minTvlUsd = opts.minTvlUsd ?? 2_000_000;
  const limit = opts.limit ?? 12;
  try {
    const res = await fetchFn(MORPHO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($chains:[Int!]!,$minTvl:Float!){vaults(first:1000 where:{chainId_in:$chains totalAssetsUsd_gte:$minTvl}){items{${VAULT_FIELDS}}}}`,
        variables: { chains, minTvl: minTvlUsd },
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { vaults?: { items?: MorphoVaultItem[] } } };
    return (json.data?.vaults?.items ?? [])
      .map(toSnapshot)
      .filter((v) => STABLE_SYMBOLS.has(v.asset.toUpperCase()) && v.apy > 0 && v.apy < 0.25)
      .sort((a, b) => b.apy - a.apy)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** GoalyVault agent surface — read the current strategy + rebalance across strategies. */
const ZERO: Address = '0x0000000000000000000000000000000000000000';

export const vaultAgentAbi = [
  {
    type: 'function',
    name: 'strategies',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'rebalance',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'strategies', type: 'address[]' },
      { name: 'targets', type: 'uint256[]' },
    ],
    outputs: [],
  },
] as const;

/** A strategy exposes the Morpho vault it wraps. */
const strategyAbi = [
  {
    type: 'function',
    name: 'morpho',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

/** The Morpho vault currently backing the pool — the underlying of the vault's first strategy. */
export async function readYieldVault(client: PublicClient, vault: Address): Promise<Address> {
  const strategies = await client.readContract({
    address: vault,
    abi: vaultAgentAbi,
    functionName: 'strategies',
  });
  const [first] = strategies;
  if (!first) return ZERO;
  return client.readContract({
    address: first,
    abi: strategyAbi,
    functionName: 'morpho',
  });
}

/** Rebalance the vault's principal across whitelisted strategies (agent wallet, AGENT_ROLE). */
export async function rebalanceVault(
  wallet: WalletProvider,
  params: { vault: Address; strategies: Address[]; targets: bigint[] },
): Promise<string> {
  const data = encodeFunctionData({
    abi: vaultAgentAbi,
    functionName: 'rebalance',
    args: [params.strategies, params.targets],
  });
  return wallet.sendTransaction({ to: params.vault, data });
}
