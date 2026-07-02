import { describe, expect, test } from 'bun:test';
import { oddsBoostedPrize } from './odds';

// USDT0 / goUSDT base units (6 decimals).
const U = (n: number) => BigInt(Math.round(n * 1e6));

describe('oddsBoostedPrize', () => {
  const common = { basePrize: U(5), boostBps: 5_000n, reserve: U(1000) }; // k = 0.5, ample reserve

  test('underdog (8.00) win pays a large boost', () => {
    // boost = winningStake × (odds−1) × k = 100 × 7 × 0.5 = 350
    const r = oddsBoostedPrize({ ...common, winningStake: U(100), winningOddsBps: 80_000n });
    expect(r.boost).toBe(U(350));
    expect(r.total).toBe(U(355));
    // a winner with 10 of the 100 winning stake claims total × 10/100 = 35.5 (vs 0.5 base only)
    const perUser = (r.total * U(10)) / U(100);
    expect(perUser).toBe(U(35.5));
  });

  test('favorite (1.30) win pays a small boost', () => {
    // boost = 1000 × 0.30 × 0.5 = 150
    const r = oddsBoostedPrize({ ...common, winningStake: U(1000), winningOddsBps: 13_000n });
    expect(r.boost).toBe(U(150));
    const perUser = (r.total * U(10)) / U(1000);
    expect(perUser).toBe(U(1.55));
  });

  test('boost is capped by the reserve (stays solvent)', () => {
    const r = oddsBoostedPrize({
      basePrize: U(5),
      boostBps: 5_000n,
      reserve: U(50),
      winningStake: U(100),
      winningOddsBps: 80_000n, // uncapped boost would be 350
    });
    expect(r.boost).toBe(U(50)); // capped
    expect(r.total).toBe(U(55));
  });

  test('odds ≤ 1.00 → no boost, just the base prize', () => {
    const r = oddsBoostedPrize({ ...common, winningStake: U(100), winningOddsBps: 10_000n });
    expect(r.boost).toBe(0n);
    expect(r.total).toBe(U(5));
  });

  test('no winners → nothing to fund', () => {
    const r = oddsBoostedPrize({ ...common, winningStake: 0n, winningOddsBps: 80_000n });
    expect(r.total).toBe(0n);
  });
});
