import { describe, expect, test } from 'bun:test';
import { BPS, applyBps, formatUnits, mulDiv, parseUnits, sum } from './money';

describe('mulDiv', () => {
  test('floors the result', () => {
    expect(mulDiv(7n, 3n, 2n)).toBe(10n); // 21/2 = 10.5 -> 10
  });

  test('throws on zero denominator', () => {
    expect(() => mulDiv(1n, 1n, 0n)).toThrow('division by zero');
  });
});

describe('applyBps', () => {
  test('applies a percentage in basis points', () => {
    expect(applyBps(1_000_000n, 500n)).toBe(50_000n); // 5% of 1.0 USDT0 (6dp)
    expect(applyBps(1_000_000n, BPS)).toBe(1_000_000n); // 100%
    expect(applyBps(1_000_000n, 0n)).toBe(0n);
  });
});

describe('sum', () => {
  test('adds bigints', () => {
    expect(sum([1n, 2n, 3n])).toBe(6n);
    expect(sum([])).toBe(0n);
  });
});

describe('parseUnits / formatUnits', () => {
  test('round-trips whole and fractional values (6 decimals)', () => {
    expect(parseUnits('100')).toBe(100_000_000n);
    expect(parseUnits('100.5')).toBe(100_500_000n);
    expect(parseUnits('0.000001')).toBe(1n);
    expect(formatUnits(100_000_000n)).toBe('100');
    expect(formatUnits(100_500_000n)).toBe('100.5');
    expect(formatUnits(1n)).toBe('0.000001');
  });

  test('handles negatives', () => {
    expect(parseUnits('-2.5')).toBe(-2_500_000n);
    expect(formatUnits(-2_500_000n)).toBe('-2.5');
  });

  test('rejects too many decimals', () => {
    expect(() => parseUnits('1.0000001')).toThrow('too many decimals');
  });
});
