import { describe, expect, test } from 'bun:test';
import { SECONDS_PER_YEAR } from './money';
import { accrueYield, isDebtCleared, remainingDebt, secondsToSelfRepay } from './yield';

const USDT0 = (n: bigint) => n * 1_000_000n; // 6 decimals

describe('accrueYield', () => {
  test('5% APY on 100 over one year = 5', () => {
    expect(accrueYield(USDT0(100n), 500n, SECONDS_PER_YEAR)).toBe(USDT0(5n));
  });

  test('scales linearly with time (half a year = half)', () => {
    expect(accrueYield(USDT0(100n), 500n, SECONDS_PER_YEAR / 2n)).toBe(USDT0(5n) / 2n);
  });

  test('zero over zero time', () => {
    expect(accrueYield(USDT0(100n), 500n, 0n)).toBe(0n);
  });

  test('rejects negative inputs', () => {
    expect(() => accrueYield(-1n, 500n, 1n)).toThrow('non-negative');
  });
});

describe('remainingDebt / isDebtCleared', () => {
  test('debt shrinks as yield accrues', () => {
    expect(remainingDebt(USDT0(5n), USDT0(2n))).toBe(USDT0(3n));
    expect(remainingDebt(USDT0(5n), USDT0(5n))).toBe(0n);
    expect(remainingDebt(USDT0(5n), USDT0(9n))).toBe(0n); // never negative
  });

  test('isDebtCleared reflects full repayment', () => {
    expect(isDebtCleared(USDT0(5n), USDT0(4n))).toBe(false);
    expect(isDebtCleared(USDT0(5n), USDT0(5n))).toBe(true);
  });
});

describe('secondsToSelfRepay', () => {
  test('5 debt at 5% APY on 100 principal clears in one year', () => {
    expect(secondsToSelfRepay(USDT0(5n), USDT0(100n), 500n)).toBe(SECONDS_PER_YEAR);
  });

  test('no debt clears instantly', () => {
    expect(secondsToSelfRepay(0n, USDT0(100n), 500n)).toBe(0n);
  });

  test('throws when there is no yield source', () => {
    expect(() => secondsToSelfRepay(USDT0(5n), 0n, 500n)).toThrow('no yield source');
  });
});
