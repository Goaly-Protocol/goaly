import { describe, expect, test } from 'bun:test';
import { sum } from './money';
import { distributePot } from './pot';

const USDT0 = (n: bigint) => n * 1_000_000n;

describe('distributePot', () => {
  test('splits the pot pro-rata by stake with no fee', () => {
    // pot 100, winner stakes 40 total → yield 60; each winner gets stake + pro-rata yield.
    const d = distributePot(USDT0(100n), [
      { id: 'a', stake: USDT0(30n) },
      { id: 'b', stake: USDT0(10n) },
    ]);
    expect(d.fee).toBe(0n);
    expect(d.distributable).toBe(USDT0(100n));
    expect(d.payouts.find((p) => p.id === 'a')?.payout).toBe(USDT0(75n)); // 30 + 45
    expect(d.payouts.find((p) => p.id === 'b')?.payout).toBe(USDT0(25n)); // 10 + 15
    expect(d.dust).toBe(0n);
  });

  test('charges the fee on the yield only, never the principal', () => {
    // pot 100, one winner staking 40 → yield 60; a 20% fee = 12 off the yield; principal untouched.
    const d = distributePot(USDT0(100n), [{ id: 'a', stake: USDT0(40n) }], 2_000n);
    expect(d.fee).toBe(USDT0(12n));
    expect(d.payouts[0]?.payout).toBe(USDT0(88n)); // stake 40 + net yield 48
    expect(d.distributable).toBe(USDT0(88n));
  });

  test('NO-LOSS: with no yield (all stake on the winner) each winner gets exactly their stake', () => {
    // pot == combined winner stake → zero yield → zero fee → full principal back, even at a 20% rate.
    const d = distributePot(
      USDT0(2n),
      [
        { id: 'a', stake: USDT0(1n) },
        { id: 'b', stake: USDT0(1n) },
      ],
      2_000n,
    );
    expect(d.fee).toBe(0n);
    expect(d.payouts.find((p) => p.id === 'a')?.payout).toBe(USDT0(1n));
    expect(d.payouts.find((p) => p.id === 'b')?.payout).toBe(USDT0(1n));
  });

  test('conserves value: fee + payouts + dust == pot', () => {
    const d = distributePot(
      1_000_000n,
      [
        { id: 'a', stake: 1n },
        { id: 'b', stake: 1n },
        { id: 'c', stake: 1n },
      ],
      250n,
    );
    const allocated = sum(d.payouts.map((p) => p.payout));
    expect(d.fee + allocated + d.dust).toBe(1_000_000n);
    expect(d.dust).toBeGreaterThanOrEqual(0n);
  });

  test('no winners: everything becomes dust for rollover (no fee taken)', () => {
    const d = distributePot(USDT0(50n), []);
    expect(d.fee).toBe(0n);
    expect(d.payouts).toHaveLength(0);
    expect(d.dust).toBe(USDT0(50n));
  });

  test('rejects out-of-range fee', () => {
    expect(() => distributePot(USDT0(1n), [], 10_001n)).toThrow('feeBps out of range');
  });
});
