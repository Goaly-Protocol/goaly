/** Pot distribution: winners split the credit-stake pot pro-rata, minus protocol fee. */

import { BPS, applyBps, sum } from './money';

export interface Stake {
  id: string;
  stake: bigint;
}

export interface Payout {
  id: string;
  stake: bigint;
  payout: bigint;
}

export interface PotDistribution {
  pot: bigint;
  /** Protocol fee — taken from the yield only, never from principal. */
  fee: bigint;
  /** Total paid to winners after the fee (their principal + net yield). */
  distributable: bigint;
  payouts: Payout[];
  /** Rounding remainder left unallocated (caller decides: roll over / treasury). */
  dust: bigint;
}

/**
 * Distribute `pot` across `winners` — NO-LOSS: every winner recovers their full stake (principal),
 * and only the YIELD (the surplus over the winners' combined stake) is split pro-rata among them.
 * The protocol `feeBps` is charged on that yield alone, so a fee can never eat into principal —
 * with no yield (e.g. everyone backed the winning outcome), each winner gets exactly their stake.
 * If there are no winners, the whole pot rolls over as `dust` (losers are principal-refunded).
 */
export function distributePot(
  pot: bigint,
  winners: readonly Stake[],
  feeBps = 0n,
): PotDistribution {
  if (pot < 0n) throw new Error('distributePot: pot must be non-negative');
  if (feeBps < 0n || feeBps > BPS) throw new Error('distributePot: feeBps out of range');
  for (const w of winners) {
    if (w.stake < 0n) throw new Error('distributePot: stakes must be non-negative');
  }

  const totalStake = sum(winners.map((w) => w.stake));

  // No winners → nobody to pay; the pot rolls over (losers keep their principal, refunded elsewhere).
  if (totalStake === 0n) {
    return { pot, fee: 0n, distributable: 0n, payouts: [], dust: pot };
  }

  // Yield = whatever the pot holds beyond the winners' own stakes. The fee is charged on this only.
  const yieldAmount = pot > totalStake ? pot - totalStake : 0n;
  const fee = applyBps(yieldAmount, feeBps);
  const netYield = yieldAmount - fee;

  const payouts: Payout[] = winners.map((w) => ({
    id: w.id,
    stake: w.stake,
    payout: w.stake + (netYield * w.stake) / totalStake,
  }));
  const allocatedYield = sum(payouts.map((p) => p.payout - p.stake));

  return {
    pot,
    fee,
    distributable: totalStake + netYield,
    payouts,
    dust: netYield - allocatedYield,
  };
}
