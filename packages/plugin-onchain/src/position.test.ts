import { describe, expect, test } from 'bun:test';
import { buildPosition, serializePosition } from './position';

const USDT0 = (n: bigint) => n * 1_000_000n;

describe('buildPosition', () => {
  test('locks principal until yield clears debt', () => {
    const p = buildPosition({ principal: USDT0(100n), debt: USDT0(5n), yieldAccrued: USDT0(2n) });
    expect(p.remainingDebt).toBe(USDT0(3n));
    expect(p.principalLocked).toBe(true);
    expect(p.withdrawableNow).toBe(0n);
  });

  test('unlocks principal once yield clears debt', () => {
    const p = buildPosition({ principal: USDT0(100n), debt: USDT0(5n), yieldAccrued: USDT0(5n) });
    expect(p.principalLocked).toBe(false);
    expect(p.withdrawableNow).toBe(USDT0(100n));
    expect(p.principalSafe).toBe(true);
  });
});

describe('serializePosition', () => {
  test('stringifies bigint fields', () => {
    const s = serializePosition(
      buildPosition({ principal: USDT0(100n), debt: 0n, yieldAccrued: 0n }, USDT0(8n)),
    );
    expect(s.principal).toBe('100000000');
    expect(s.winnings).toBe('8000000');
    expect(s.principalSafe).toBe(true);
  });
});
