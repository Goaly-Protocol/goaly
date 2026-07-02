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
  /** Protocol fee taken off the top. */
  fee: bigint;
  /** Amount available to winners after the fee. */
  distributable: bigint;
  payouts: Payout[];
  /** Rounding remainder left unallocated (caller decides: roll over / treasury). */
  dust: bigint;
}

/**
 * Distribute `pot` across `winners` pro-rata by stake, after taking `feeBps`.
 * If there are no winners (or zero total stake), the full distributable amount
 * is returned as `dust` for the caller to roll over or refund.
 */
export function distributePot(pot: bigint, winners: readonly Stake[], feeBps = 0n): PotDistribution {
  if (pot < 0n) throw new Error('distributePot: pot must be non-negative');
  if (feeBps < 0n || feeBps > BPS) throw new Error('distributePot: feeBps out of range');
  for (const w of winners) {
    if (w.stake < 0n) throw new Error('distributePot: stakes must be non-negative');
  }

  const fee = applyBps(pot, feeBps);
  const distributable = pot - fee;
  const totalStake = sum(winners.map((w) => w.stake));

  if (totalStake === 0n) {
    return { pot, fee, distributable, payouts: [], dust: distributable };
  }

  const payouts: Payout[] = winners.map((w) => ({
    id: w.id,
    stake: w.stake,
    payout: (distributable * w.stake) / totalStake,
  }));
  const allocated = sum(payouts.map((p) => p.payout));

  return { pot, fee, distributable, payouts, dust: distributable - allocated };
}
