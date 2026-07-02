/**
 * Autonomous yield-rebalancing policy for the Goaly Yield Agent.
 *
 * The agent holds MANAGER_ROLE on GoalyVault and can migrate the protocol's backing between Morpho
 * USDT0 vaults. This module is the pure decision core: given live vault economics it decides whether
 * a migration is worth it — never touching the network, so it is fully deterministic + testable.
 */

/** A yield vault's live economics. `apy` is a fraction (0.0172 = 1.72%). */
export interface VaultSnapshot {
  address: string;
  name: string;
  apy: number;
  tvlUsd: number;
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
  to: VaultSnapshot | null;
  gainBps: number;
  reason: string;
}

const BPS = 10_000; // 10_000 bps = 100%

function pct(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Decide whether to migrate the vault's backing. A candidate must clear the TVL risk floor to be a
 * migration target, and must beat the current vault by at least `minApyGainBps`. The current vault
 * is always allowed to stay (even if it dips below the floor) — we only gate moving *into* thin ones.
 */
export function decideRebalance(
  vaults: VaultSnapshot[],
  currentAddress: string,
  params: RebalanceParams,
): RebalanceDecision {
  const current = vaults.find((v) => same(v.address, currentAddress)) ?? null;

  const candidates = vaults.filter(
    (v) => v.tvlUsd >= params.minTvlUsd || same(v.address, currentAddress),
  );
  const best = candidates.reduce<VaultSnapshot | null>(
    (b, v) => (!b || v.apy > b.apy ? v : b),
    null,
  );

  if (!best) {
    return {
      shouldRebalance: false,
      from: current,
      to: null,
      gainBps: 0,
      reason: 'no eligible vault',
    };
  }
  if (!current) {
    return {
      shouldRebalance: true,
      from: null,
      to: best,
      gainBps: 0,
      reason: `deploy into ${best.name} (${pct(best.apy)})`,
    };
  }
  if (same(best.address, current.address)) {
    return {
      shouldRebalance: false,
      from: current,
      to: current,
      gainBps: 0,
      reason: `holding ${current.name} — already the best risk-adjusted APY (${pct(current.apy)})`,
    };
  }

  const gainBps = Math.round((best.apy - current.apy) * BPS);
  if (gainBps < params.minApyGainBps) {
    return {
      shouldRebalance: false,
      from: current,
      to: best,
      gainBps,
      reason: `${best.name} leads by ${gainBps}bps — below the ${params.minApyGainBps}bps threshold, staying put`,
    };
  }
  return {
    shouldRebalance: true,
    from: current,
    to: best,
    gainBps,
    reason: `${current.name} ${pct(current.apy)} → ${best.name} ${pct(best.apy)} (+${gainBps}bps)`,
  };
}
