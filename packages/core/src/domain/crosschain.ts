/**
 * Cross-chain rebalance routing for the Goaly Yield Agent.
 *
 * When the best vault anywhere lives on another chain, the agent can't migrate directly — the funds
 * must travel. This module turns "current backing here, best vault there" into a concrete LayerZero
 * route: bridge USDT0 via its OFT to the destination, swap into the vault's asset if it differs, and
 * deposit — all composable into a single LayerZero message (OFT transfer + compose-deposit). Pure and
 * deterministic; the agent service attaches the route to its status and the UI renders it.
 */

import type { VaultSnapshot } from './rebalance';

/** LayerZero V2 mainnet endpoint ids by EVM chain id. */
export const LZ_EID: Record<number, number> = {
  1: 30101, // Ethereum
  42161: 30110, // Arbitrum
  8453: 30184, // Base
  10: 30111, // Optimism
  137: 30109, // Polygon
  130: 30320, // Unichain
};

/** LayerZero Value Transfer API chain keys by EVM chain id. */
export const LZ_CHAIN_KEY: Record<number, string> = {
  1: 'ethereum',
  42161: 'arbitrum',
  8453: 'base',
  10: 'optimism',
  137: 'polygon',
  130: 'unichain',
};

export interface RouteStep {
  action: 'Bridge' | 'Swap' | 'Deposit';
  detail: string;
}

export interface CrossChainRoute {
  fromChain: string;
  toChain: string;
  /** Destination LayerZero endpoint id (for the OFT send). */
  dstEid: number;
  /** LayerZero Value Transfer API identifiers, so the route can be quoted/executed live. */
  srcChainKey: string;
  dstChainKey: string;
  srcToken: string; // USDT0 on the source chain
  dstToken: string; // the vault's asset on the destination chain
  steps: RouteStep[];
  /** Set once the agent has confirmed the path against LayerZero's live token graph. */
  validated?: boolean;
  /** What still has to be in place for this route to fire live. */
  note: string;
}

const pct = (apy: number) => `${(apy * 100).toFixed(2)}%`;

/**
 * Build the cross-chain route from the current backing to `to`. Returns null when they're on the
 * same chain (no bridge needed) or the destination chain isn't LayerZero-routable here.
 */
export function crossChainRoute(from: VaultSnapshot, to: VaultSnapshot): CrossChainRoute | null {
  if (from.chainId === to.chainId) return null;
  const dstEid = LZ_EID[to.chainId];
  const srcChainKey = LZ_CHAIN_KEY[from.chainId];
  const dstChainKey = LZ_CHAIN_KEY[to.chainId];
  if (!dstEid || !srcChainKey || !dstChainKey || !from.assetAddress || !to.assetAddress)
    return null;

  const steps: RouteStep[] = [
    {
      action: 'Bridge',
      detail: `${from.asset} ${from.chain} → ${to.chain} via LayerZero (eid ${dstEid})`,
    },
  ];
  if (from.asset.toUpperCase() !== to.asset.toUpperCase()) {
    steps.push({ action: 'Swap', detail: `${from.asset} → ${to.asset} on ${to.chain}` });
  }
  steps.push({ action: 'Deposit', detail: `into ${to.name} (${pct(to.apy)})` });

  return {
    fromChain: from.chain,
    toChain: to.chain,
    dstEid,
    srcChainKey,
    dstChainKey,
    srcToken: from.assetAddress,
    dstToken: to.assetAddress,
    steps,
    note:
      'Routed by the LayerZero Value Transfer API (OFT/Stargate/CCTP). Live firing needs a VT API ' +
      'key + the agent wallet funded with USDT0 on the source chain (destination fees are handled ' +
      'by LayerZero messaging).',
  };
}
