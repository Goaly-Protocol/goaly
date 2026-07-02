import { describe, expect, test } from 'bun:test';
import { computePosition } from './position';

const USDT0 = (n: bigint) => n * 1_000_000n;

describe('computePosition', () => {
  test('principal is locked while debt is outstanding', () => {
    const p = computePosition({
      principal: USDT0(100n),
      creditStaked: USDT0(5n),
      yieldAccrued: USDT0(2n),
      winnings: 0n,
    });
    expect(p.remainingDebt).toBe(USDT0(3n));
    expect(p.principalLocked).toBe(true);
    expect(p.withdrawableNow).toBe(0n); // principal locked, no winnings
    expect(p.valueAtMaturity).toBe(USDT0(100n));
    expect(p.principalSafe).toBe(true);
  });

  test('principal unlocks once yield clears the debt', () => {
    const p = computePosition({
      principal: USDT0(100n),
      creditStaked: USDT0(5n),
      yieldAccrued: USDT0(5n),
      winnings: 0n,
    });
    expect(p.remainingDebt).toBe(0n);
    expect(p.principalLocked).toBe(false);
    expect(p.withdrawableNow).toBe(USDT0(100n));
  });

  test('winnings are withdrawable even while principal is locked', () => {
    const p = computePosition({
      principal: USDT0(100n),
      creditStaked: USDT0(5n),
      yieldAccrued: 0n,
      winnings: USDT0(8n),
    });
    expect(p.principalLocked).toBe(true);
    expect(p.withdrawableNow).toBe(USDT0(8n));
    expect(p.valueAtMaturity).toBe(USDT0(108n));
  });

  test('lose everything staked and principal still comes back whole', () => {
    // Player staked 5 credit, lost (no winnings). Once yield repays the 5, they
    // withdraw their full 100 principal — never less.
    const p = computePosition({
      principal: USDT0(100n),
      creditStaked: USDT0(5n),
      yieldAccrued: USDT0(5n),
      winnings: 0n,
    });
    expect(p.withdrawableNow).toBe(USDT0(100n));
    expect(p.withdrawableNow).toBeGreaterThanOrEqual(0n);
  });

  test('rejects negative inputs', () => {
    expect(() =>
      computePosition({ principal: -1n, creditStaked: 0n, yieldAccrued: 0n, winnings: 0n }),
    ).toThrow('non-negative');
  });
});
