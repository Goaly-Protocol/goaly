import { http, type PublicClient, createPublicClient } from 'viem';
import { arbitrum } from 'viem/chains';

/** A read-only Arbitrum client for on-chain vault reads. */
export function createArbitrumClient(rpcUrl?: string): PublicClient {
  return createPublicClient({ chain: arbitrum, transport: http(rpcUrl) });
}
