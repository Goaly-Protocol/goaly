/**
 * A player's net position. The core invariant: **principal is never used to pay
 * debt**. Principal unlocks only once accrued yield has fully repaid the credit
 * debt — so a player can never lose their deposit, only their future yield.
 */

import { remainingDebt } from './yield';

export interface PositionInput {
  /** Deposited collateral, base units. Always returnable. */
  principal: bigint;
  /** Total credit borrowed for predictions (the debt), base units. */
  creditStaked: bigint;
  /** Yield earned by this player's principal so far, base units. */
  yieldAccrued: bigint;
  /** Winnings from won pots, base units. Withdrawable immediately. */
  winnings: bigint;
}

export interface Position extends PositionInput {
  debt: bigint;
  remainingDebt: bigint;
  /** True while debt is outstanding — principal stays locked until yield clears it. */
  principalLocked: boolean;
  /** What the player can withdraw right now. */
  withdrawableNow: bigint;
  /** What the player ends with once the debt self-repays: principal + winnings. */
  valueAtMaturity: bigint;
  /** Structural guarantee — principal is never consumed to settle debt. */
  principalSafe: true;
}

export function computePosition(input: PositionInput): Position {
  const { principal, creditStaked, yieldAccrued, winnings } = input;
  if (principal < 0n || creditStaked < 0n || yieldAccrued < 0n || winnings < 0n) {
    throw new Error('computePosition: inputs must be non-negative');
  }

  const debtLeft = remainingDebt(creditStaked, yieldAccrued);
  const principalLocked = debtLeft > 0n;
  const withdrawableNow = winnings + (principalLocked ? 0n : principal);
  const valueAtMaturity = principal + winnings;

  return {
    principal,
    creditStaked,
    yieldAccrued,
    winnings,
    debt: creditStaked,
    remainingDebt: debtLeft,
    principalLocked,
    withdrawableNow,
    valueAtMaturity,
    principalSafe: true,
  };
}
