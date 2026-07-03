/**
 * Cross-chain rebalance routing for the Goaly Yield Agent — powered by Wormhole.
 *
 * When the best vault anywhere lives on another chain, the funds must travel. Wormhole moves USDC
 * natively across chains via Circle CCTP (its Automatic CCTP route — burn-and-mint, no wrapped
 * assets), so the agent bridges USDC through Wormhole and swaps into the vault's token on each side
 * when it differs. This module turns "current backing here, best vault there" into that concrete
 * Wormhole route. Pure + deterministic; the agent service attaches it to the status and the UI
 * renders it.
 */

import type { VaultSnapshot } from './rebalance';

/** Wormhole chain ids by EVM chain id. */
export const WORMHOLE_CHAIN_ID: Record<number, number> = {
  1: 2, // Ethereum
  42161: 23, // Arbitrum
  8453: 30, // Base
  10: 24, // Optimism
  137: 5, // Polygon
  130: 44, // Unichain
};

/** Wormhole chain name by EVM chain id (Wormhole SDK identifiers). */
export const WORMHOLE_CHAIN_NAME: Record<number, string> = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  8453: 'Base',
  10: 'Optimism',
  137: 'Polygon',
  130: 'Unichain',
};

/** EVM chains where Circle CCTP (and thus Wormhole's Automatic CCTP route) is live. */
export const CCTP_CHAINS = new Set([1, 42161, 8453, 10, 137, 130]);

/** The asset Wormhole moves natively across chains (Circle CCTP burns/mints it). */
const BRIDGE_ASSET = 'USDC';

export interface RouteStep {
  action: 'Swap' | 'Bridge' | 'Deposit';
  detail: string;
}

export interface CrossChainRoute {
  fromChain: string;
  toChain: string;
  /** Destination Wormhole chain id. */
  wormholeChainId: number;
  /** Wormhole route used for the bridge leg. */
  protocol: string;
  srcToken: string; // current backing token on the source chain
  dstToken: string; // the vault's asset on the destination chain
  steps: RouteStep[];
  /** True when Wormhole supports the whole path (both chains connected + CCTP for the USDC leg). */
  supported: boolean;
  /** What still has to be in place for this route to fire live. */
  note: string;
}

const pct = (apy: number) => `${(apy * 100).toFixed(2)}%`;
const isUsdc = (asset: string) => asset.toUpperCase() === BRIDGE_ASSET;

/**
 * Build the Wormhole route from the current backing to `to`. Returns null when they're on the same
 * chain (no bridge needed) or the destination chain isn't Wormhole-routable here.
 */
export function crossChainRoute(from: VaultSnapshot, to: VaultSnapshot): CrossChainRoute | null {
  if (from.chainId === to.chainId) return null;
  const whId = WORMHOLE_CHAIN_ID[to.chainId];
  if (!whId || !WORMHOLE_CHAIN_ID[from.chainId] || !from.assetAddress || !to.assetAddress) {
    return null;
  }

  // Wormhole moves USDC natively via CCTP; swap into/out of USDC on each side when the asset differs.
  const steps: RouteStep[] = [];
  if (!isUsdc(from.asset)) {
    steps.push({ action: 'Swap', detail: `${from.asset} → USDC on ${from.chain}` });
  }
  steps.push({
    action: 'Bridge',
    detail: `USDC ${from.chain} → ${to.chain} via Wormhole CCTP`,
  });
  if (!isUsdc(to.asset)) {
    steps.push({ action: 'Swap', detail: `USDC → ${to.asset} on ${to.chain}` });
  }
  steps.push({ action: 'Deposit', detail: `into ${to.name} (${pct(to.apy)})` });

  const supported = CCTP_CHAINS.has(from.chainId) && CCTP_CHAINS.has(to.chainId);

  return {
    fromChain: from.chain,
    toChain: to.chain,
    wormholeChainId: whId,
    protocol: 'Wormhole Automatic CCTP',
    srcToken: from.assetAddress,
    dstToken: to.assetAddress,
    steps,
    supported,
    note:
      'Bridged by Wormhole (Circle CCTP — burn-and-mint USDC, no wrapped assets). Live firing needs ' +
      'the agent wallet funded on the source chain; Wormhole relays and mints on the destination.',
  };
}
