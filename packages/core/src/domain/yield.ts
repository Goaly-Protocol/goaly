/**
 * Yield accrual and the self-repaying-debt mechanic that powers GoalYield.
 *
 * A player's prediction credit is a debt. It is *only ever* repaid by the yield
 * their deposited principal earns — never from the principal itself. Given time,
 * the debt always self-repays.
 */

import { BPS, SECONDS_PER_YEAR } from './money';

/** Linear yield earned by `principal` at `apyBps` over `elapsedSeconds`. */
export function accrueYield(principal: bigint, apyBps: bigint, elapsedSeconds: bigint): bigint {
  if (principal < 0n || apyBps < 0n || elapsedSeconds < 0n) {
    throw new Error('accrueYield: inputs must be non-negative');
  }
  return (principal * apyBps * elapsedSeconds) / (BPS * SECONDS_PER_YEAR);
}

/** Debt remaining after yield is applied: `max(0, debt - yieldAccrued)`. */
export function remainingDebt(debt: bigint, yieldAccrued: bigint): bigint {
  if (debt < 0n || yieldAccrued < 0n) {
    throw new Error('remainingDebt: inputs must be non-negative');
  }
  return debt > yieldAccrued ? debt - yieldAccrued : 0n;
}

/** True once accrued yield has fully repaid the debt. */
export function isDebtCleared(debt: bigint, yieldAccrued: bigint): boolean {
  return remainingDebt(debt, yieldAccrued) === 0n;
}

/**
 * Seconds until `debt` fully self-repays from the yield of `principal` at
 * `apyBps` (ceiling). Returns 0 when there is no debt.
 */
export function secondsToSelfRepay(debt: bigint, principal: bigint, apyBps: bigint): bigint {
  if (debt <= 0n) return 0n;
  if (principal <= 0n || apyBps <= 0n) {
    throw new Error('secondsToSelfRepay: no yield source (principal and apyBps must be > 0)');
  }
  const numerator = debt * BPS * SECONDS_PER_YEAR;
  const denominator = principal * apyBps;
  return (numerator + denominator - 1n) / denominator; // ceil
}
