import { BPS } from './money';

export interface OddsBoostParams {
  /** Yield allocated to this market's base prize (USDT0 base units). */
  basePrize: bigint;
  /** Total stake on the winning outcome (goUSDT base units, 1:1 with USDT0). */
  winningStake: bigint;
  /** Decimal odds of the winning outcome × 10_000 (e.g. 8.00 → 80_000). */
  winningOddsBps: bigint;
  /** Boost factor in bps (e.g. 5_000 = 0.5×). */
  boostBps: bigint;
  /** Protocol yield reserve available to fund boosts (USDT0 base units). */
  reserve: bigint;
}

export interface OddsBoostedPrize {
  /** Base prize from market yield. */
  base: bigint;
  /** Odds boost drawn from the reserve (capped). */
  boost: bigint;
  /** base + boost — the amount the oracle funds into the market at settlement. */
  total: bigint;
}

/**
 * Odds-boosted parimutuel prize sizing.
 *
 * Every winner of a market picked the same (winning) outcome, so its odds are uniform among them.
 * That means the odds boost can be applied at the *market* level: the existing pro-rata `claim`
 * (`total × stake / winningStake`) then distributes it so each winner receives exactly
 * `stake × (odds − 1) × k`. **No contract change is needed** — the oracle just funds `total`.
 *
 * The boost is capped by the protocol reserve, so payouts can never exceed the yield that exists
 * (the protocol stays solvent; when the reserve is tight, boosts scale down automatically).
 */
export function oddsBoostedPrize(params: OddsBoostParams): OddsBoostedPrize {
  const { basePrize, winningStake, winningOddsBps, boostBps, reserve } = params;
  // No winners → nothing to fund or distribute.
  if (winningStake <= 0n) return { base: 0n, boost: 0n, total: 0n };

  const oddsMinusOne = winningOddsBps > BPS ? winningOddsBps - BPS : 0n;
  const uncappedBoost = (winningStake * oddsMinusOne * boostBps) / (BPS * BPS);
  const boost = uncappedBoost > reserve ? reserve : uncappedBoost;
  return { base: basePrize, boost, total: basePrize + boost };
}
