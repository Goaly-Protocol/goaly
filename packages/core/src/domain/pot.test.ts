import { describe, expect, test } from 'bun:test';
import { sum } from './money';
import { distributePot } from './pot';

const USDT0 = (n: bigint) => n * 1_000_000n;

describe('distributePot', () => {
  test('splits pro-rata by stake with no fee', () => {
    const d = distributePot(USDT0(100n), [
      { id: 'a', stake: USDT0(30n) },
      { id: 'b', stake: USDT0(10n) },
    ]);
    expect(d.fee).toBe(0n);
    expect(d.distributable).toBe(USDT0(100n));
    expect(d.payouts.find((p) => p.id === 'a')?.payout).toBe(USDT0(75n));
    expect(d.payouts.find((p) => p.id === 'b')?.payout).toBe(USDT0(25n));
    expect(d.dust).toBe(0n);
  });

  test('takes a protocol fee off the top', () => {
    const d = distributePot(USDT0(100n), [{ id: 'a', stake: USDT0(1n) }], 1_000n); // 10%
    expect(d.fee).toBe(USDT0(10n));
    expect(d.distributable).toBe(USDT0(90n));
    expect(d.payouts[0]?.payout).toBe(USDT0(90n));
  });

  test('conserves value: fee + payouts + dust == pot', () => {
    const d = distributePot(1_000_000n, [
      { id: 'a', stake: 1n },
      { id: 'b', stake: 1n },
      { id: 'c', stake: 1n },
    ], 250n);
    const allocated = sum(d.payouts.map((p) => p.payout));
    expect(d.fee + allocated + d.dust).toBe(1_000_000n);
    expect(d.dust).toBeGreaterThanOrEqual(0n);
  });

  test('no winners: everything becomes dust for rollover', () => {
    const d = distributePot(USDT0(50n), []);
    expect(d.payouts).toHaveLength(0);
    expect(d.dust).toBe(USDT0(50n));
  });

  test('rejects out-of-range fee', () => {
    expect(() => distributePot(USDT0(1n), [], 10_001n)).toThrow('feeBps out of range');
  });
});
