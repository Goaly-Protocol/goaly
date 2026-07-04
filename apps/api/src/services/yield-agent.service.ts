import {
  type CrossChainRoute,
  crossChainRoute,
  decideRebalance,
  type RebalanceDecision,
  type RebalanceParams,
  type VaultSnapshot,
} from '@goaly/core';
import {
  fetchStablecoinVaults,
  fetchVaultSnapshots,
  readYieldVault,
} from '@goaly/plugin-onchain';
import type { WalletProvider } from '@goaly/plugin-wdk';
import { aiRebalanceRationale } from './ai-agent';
import type { Address, PublicClient } from 'viem';

export interface YieldAgentStatus {
  vault: Address;
  currentVault: string | null;
  current: VaultSnapshot | null;
  candidates: VaultSnapshot[];
  decision: RebalanceDecision | null;
  /** Concrete Wormhole route to the best global vault when it lives on another chain. */
  route: CrossChainRoute | null;
  /** LLM (OpenAI) rationale + confidence for the current decision, when configured. */
  ai: { reason: string; confidence: number } | null;
  lastRunAt: number | null;
  lastTxHash: string | null;
  autoExecute: boolean;
  canExecute: boolean;
}

export interface YieldAgentDeps {
  client: PublicClient;
  vault: Address;
  candidateVaults: Address[];
  params: RebalanceParams;
  wallet?: WalletProvider;
  autoExecute?: boolean;
  /** OpenAI key — enables the LLM reasoning layer over the rule-based decision (advisory). */
  openaiKey?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/**
 * The Goaly Yield Agent — a WDK agent wallet that watches Morpho USDT0 vault APYs and recommends the
 * best risk-adjusted vault for the protocol's backing. Deciding is pure ({@link decideRebalance});
 * this service adds the live reads + a cached status for the UI/API. Advisory only: the vault has a
 * single whitelisted strategy today, so the decision is surfaced but never executed on-chain.
 */
export class YieldAgentService {
  private status: YieldAgentStatus;

  constructor(private readonly deps: YieldAgentDeps) {
    this.status = {
      vault: deps.vault,
      currentVault: null,
      current: null,
      candidates: [],
      decision: null,
      route: null,
      ai: null,
      lastRunAt: null,
      lastTxHash: null,
      autoExecute: Boolean(deps.autoExecute),
      canExecute: Boolean(deps.wallet),
    };
  }

  getStatus(): YieldAgentStatus {
    return this.status;
  }

  /** Read the current vault + APYs and decide. Advisory only — the decision is surfaced, not executed. */
  async run(_execute: boolean = this.deps.autoExecute ?? false): Promise<YieldAgentStatus> {
    const now = (this.deps.now ?? Date.now)();
    const currentAddress = await readYieldVault(this.deps.client, this.deps.vault);
    const fetchOpt = this.deps.fetchFn ? { fetchFn: this.deps.fetchFn } : {};
    // Same-venue candidates (Arbitrum USDT0 — directly migratable) + the whole cross-chain,
    // cross-token stablecoin landscape (for global awareness of the best yield anywhere).
    const [executable, landscape] = await Promise.all([
      fetchVaultSnapshots(this.deps.candidateVaults, fetchOpt),
      fetchStablecoinVaults(fetchOpt),
    ]);
    const byAddr = new Map<string, VaultSnapshot>();
    for (const v of [...executable, ...landscape]) byAddr.set(v.address.toLowerCase(), v);
    const candidates = [...byAddr.values()].sort((a, b) => b.apy - a.apy);
    const decision = decideRebalance(candidates, currentAddress, this.deps.params);
    const current =
      candidates.find((v) => v.address.toLowerCase() === currentAddress.toLowerCase()) ?? null;
    // When the best vault anywhere is on another chain, spell out the Wormhole route to reach it.
    const route =
      decision.crossVenue && current && decision.globalBest
        ? crossChainRoute(current, decision.globalBest)
        : null;

    // LLM reasoning layer (advisory) — narrates + scores the rule-based decision.
    let ai = this.status.ai;
    if (this.deps.openaiKey) {
      const toVault = (v: VaultSnapshot | null) =>
        v ? { name: v.name, apy: v.apy, tvlUsd: v.tvlUsd, chain: v.chain, asset: v.asset } : null;
      ai =
        (await aiRebalanceRationale(this.deps.openaiKey, {
          current: toVault(current),
          best: toVault(decision.globalBest),
          shouldRebalance: decision.shouldRebalance,
          gainBps: decision.gainBps,
          crossChain: decision.crossVenue,
          candidates: candidates.map((v) => ({
            name: v.name,
            apy: v.apy,
            tvlUsd: v.tvlUsd,
            chain: v.chain,
            asset: v.asset,
          })),
          ...(this.deps.fetchFn ? { fetchFn: this.deps.fetchFn } : {}),
        })) ?? ai;
    }

    // Advisory only — the vault currently has a single whitelisted strategy, so there is nothing to
    // rebalance on-chain. We compute + surface the decision, but never execute.
    const lastTxHash = this.status.lastTxHash;

    this.status = {
      vault: this.deps.vault,
      currentVault: currentAddress,
      current,
      candidates,
      decision,
      route,
      ai,
      lastRunAt: now,
      lastTxHash,
      autoExecute: Boolean(this.deps.autoExecute),
      canExecute: Boolean(this.deps.wallet),
    };
    return this.status;
  }
}
