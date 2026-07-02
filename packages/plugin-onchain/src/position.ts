import { type Position, computePosition } from '@goaly/core';
import type { VaultReads } from './vault';

/**
 * Build a rich player position from raw on-chain vault reads (+ any off-chain winnings),
 * reusing the shared `computePosition` domain logic so on-chain and API agree.
 */
export function buildPosition(reads: VaultReads, winnings = 0n): Position {
  return computePosition({
    principal: reads.principal,
    creditStaked: reads.debt,
    yieldAccrued: reads.yieldAccrued,
    winnings,
  });
}

/** Serialize a Position to JSON-safe values (bigint → decimal string). */
export function serializePosition(position: Position): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(position)) {
    out[key] = typeof value === 'bigint' ? value.toString() : (value as boolean);
  }
  return out;
}
