/**
 * Autonomous yield-rebalancing policy for the Goaly Yield Agent.
 *
 * The agent holds MANAGER_ROLE on GoalyVault and can migrate the protocol's backing between yield
 * vaults. It scans the whole Morpho landscape — every supported chain and every stablecoin — and
 * ranks it. A migration into a vault on the SAME chain + asset as the current backing is a direct
 * on-chain move it can execute now; a higher-APY vault on another chain or in another token is the
 * global target it surfaces (reachable via a WDK bridge + swap). This module is the pure decision
 * core: given live vault economics it decides, never touching the network, so it stays testable.
 */

/** A yield vault's live economics. `apy` is a fraction (0.0172 = 1.72%). */
export interface VaultSnapshot {
  address: string;
  name: string;
  apy: number;
  tvlUsd: number;
  /** Chain the vault lives on (numeric id + display name). */
  chainId: number;
  chain: string;
  /** Underlying asset symbol, e.g. "USDT0", "USDC". */
  asset: string;
  /** Display extras from Morpho (ignored by the decision core). */
  assetAddress?: string | null;
  assetAmount?: number;
  curator?: string | null;
  curatorImage?: string | null;
  image?: string | null;
}

export interface RebalanceParams {
  /** Minimum APY improvement (bps) needed to justify a migration + its gas. */
  minApyGainBps: number;
  /** Risk floor — never migrate INTO a vault thinner than this (USD TVL). */
  minTvlUsd: number;
}

export interface RebalanceDecision {
  shouldRebalance: boolean;
  from: VaultSnapshot | null;
  /** Best vault we can migrate into right now (same chain + asset as the current backing). */
  to: VaultSnapshot | null;
  /** Highest-APY vault anywhere — may be on another chain or in another token. */
  globalBest: VaultSnapshot | null;
  /** True when `globalBest` is on a different chain/asset than the current backing. */
  crossVenue: boolean;
  gainBps: number;
  reason: string;
}

const BPS = 10_000; // 10_000 bps = 100%

function pct(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Same migration venue = same chain and same underlying asset (a direct migrate, no bridge/swap). */
const sameVenue = (a: VaultSnapshot, b: VaultSnapshot) =>
  a.chainId === b.chainId && a.asset.toUpperCase() === b.asset.toUpperCase();

const maxByApy = (vaults: VaultSnapshot[]): VaultSnapshot | null =>
  vaults.reduce<VaultSnapshot | null>((best, v) => (!best || v.apy > best.apy ? v : best), null);

/**
 * Decide whether to migrate the vault's backing. Candidates must clear the TVL risk floor. The agent
 * only *executes* migrations on the same chain + asset as the current backing; the highest-APY vault
 * anywhere is reported as `globalBest` (advisory when it's cross-venue — a WDK bridge/swap target).
 */
export function decideRebalance(
  vaults: VaultSnapshot[],
  currentAddress: string,
  params: RebalanceParams,
): RebalanceDecision {
  const current = vaults.find((v) => same(v.address, currentAddress)) ?? null;

  // Everything that clears the risk floor (the current vault is always allowed to stay).
  const eligible = vaults.filter(
    (v) => v.tvlUsd >= params.minTvlUsd || same(v.address, currentAddress),
  );
  const globalBest = maxByApy(eligible);

  if (!globalBest) {
    return {
      shouldRebalance: false,
      from: current,
      to: null,
      globalBest: null,
      crossVenue: false,
      gainBps: 0,
      reason: 'no eligible vault',
    };
  }
  if (!current) {
    return {
      shouldRebalance: true,
      from: null,
      to: globalBest,
      globalBest,
      crossVenue: false,
      gainBps: 0,
      reason: `deploy into ${globalBest.name} (${pct(globalBest.apy)}) on ${globalBest.chain}`,
    };
  }

  // Directly executable = same chain + asset as the current backing.
  const executable = eligible.filter((v) => sameVenue(v, current));
  const bestExec = maxByApy(executable) ?? current;
  const crossVenue = !sameVenue(globalBest, current);

  const gainBps = Math.round((bestExec.apy - current.apy) * BPS);
  if (!same(bestExec.address, current.address) && gainBps >= params.minApyGainBps) {
    return {
      shouldRebalance: true,
      from: current,
      to: bestExec,
      globalBest,
      crossVenue,
      gainBps,
      reason: `${current.name} ${pct(current.apy)} → ${bestExec.name} ${pct(bestExec.apy)} (+${gainBps}bps)`,
    };
  }
  const lead = same(bestExec.address, current.address)
    ? `already the best on ${current.chain}/${current.asset}`
    : `${bestExec.name} leads by ${gainBps}bps (below ${params.minApyGainBps}bps)`;
  return {
    shouldRebalance: false,
    from: current,
    to: bestExec,
    globalBest,
    crossVenue,
    gainBps,
    reason: `holding ${current.name} (${pct(current.apy)}) — ${lead}`,
  };
}
