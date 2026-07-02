import {
  decideRebalance,
  type RebalanceDecision,
  type RebalanceParams,
  type VaultSnapshot,
} from '@goaly/core';
import { fetchVaultSnapshots, migrateYieldVault, readYieldVault } from '@goaly/plugin-onchain';
import type { WalletProvider } from '@goaly/plugin-wdk';
import type { Address, PublicClient } from 'viem';

export interface YieldAgentStatus {
  vault: Address;
  currentVault: string | null;
  current: VaultSnapshot | null;
  candidates: VaultSnapshot[];
  decision: RebalanceDecision | null;
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
  fetchFn?: typeof fetch;
  now?: () => number;
}

/**
 * The Goaly Yield Agent — an autonomous WDK agent wallet that watches Morpho USDT0 vault APYs and
 * migrates the protocol's backing to the best risk-adjusted vault. Deciding is pure ({@link decideRebalance});
 * this service adds the live reads, optional on-chain execution, and a cached status for the UI/API.
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
      lastRunAt: null,
      lastTxHash: null,
      autoExecute: Boolean(deps.autoExecute),
      canExecute: Boolean(deps.wallet),
    };
  }

  getStatus(): YieldAgentStatus {
    return this.status;
  }

  /** Read the current vault + APYs, decide, and (when `execute`) migrate. Returns the fresh status. */
  async run(execute: boolean = this.deps.autoExecute ?? false): Promise<YieldAgentStatus> {
    const now = (this.deps.now ?? Date.now)();
    const currentAddress = await readYieldVault(this.deps.client, this.deps.vault);
    const candidates = await fetchVaultSnapshots(
      this.deps.candidateVaults,
      this.deps.fetchFn ? { fetchFn: this.deps.fetchFn } : {},
    );
    const decision = decideRebalance(candidates, currentAddress, this.deps.params);
    const current =
      candidates.find((v) => v.address.toLowerCase() === currentAddress.toLowerCase()) ?? null;

    let lastTxHash = this.status.lastTxHash;
    if (execute && decision.shouldRebalance && decision.to && this.deps.wallet) {
      lastTxHash = await migrateYieldVault(this.deps.wallet, {
        vault: this.deps.vault,
        newYieldVault: decision.to.address as Address,
      });
    }

    this.status = {
      vault: this.deps.vault,
      currentVault: currentAddress,
      current,
      candidates,
      decision,
      lastRunAt: now,
      lastTxHash,
      autoExecute: Boolean(this.deps.autoExecute),
      canExecute: Boolean(this.deps.wallet),
    };
    return this.status;
  }
}
