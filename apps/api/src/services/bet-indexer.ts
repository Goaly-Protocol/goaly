import { ARBITRUM } from '@goaly/core';
import { createArbitrumClient, marketIdFor } from '@goaly/plugin-onchain';
import { parseAbiItem } from 'viem';
import type { DB } from '../db/client';
import { matches, predictions } from '../db/schema';

const PREDICTED = parseAbiItem(
  'event Predicted(bytes32 indexed marketId, address indexed user, uint8 outcome, uint256 stake)',
);
const OUTCOMES = ['HOME', 'DRAW', 'AWAY'] as const;
const CHUNK = 9_000n;

/**
 * Indexes on-chain `Predicted` events into the predictions table so a wallet's bets always
 * show — even if the client's off-chain record POST failed (blocked network, etc.). The chain is the
 * source of truth. Idempotent: one row per (tx, log), keyed so re-scans never duplicate.
 */
export function createBetIndexer(db: DB, rpcUrl: string) {
  const client = createArbitrumClient(rpcUrl);
  const markets = ARBITRUM.goaly.markets as `0x${string}`;
  let cursor = BigInt(ARBITRUM.goaly.deployBlock);

  return async function indexBets(): Promise<number> {
    const latest = await client.getBlockNumber();
    if (cursor > latest) return 0;

    // marketId (keccak of matchId) → matchId, for the known fixtures.
    const rows = db.select({ id: matches.id }).from(matches).all();
    const byMarket = new Map(rows.map((r) => [marketIdFor(r.id).toLowerCase(), r.id]));
    const now = Math.floor(Date.now() / 1000);

    let from = cursor;
    let indexed = 0;
    while (from <= latest) {
      const to = from + CHUNK > latest ? latest : from + CHUNK;
      const logs = await client.getLogs({
        address: markets,
        event: PREDICTED,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const matchId = byMarket.get(String(log.args.marketId).toLowerCase());
        if (!matchId) continue;
        const outcome = OUTCOMES[Number(log.args.outcome)] ?? 'HOME';
        db.insert(predictions)
          .values({
            id: `${log.transactionHash}-${log.logIndex}`,
            userId: String(log.args.user),
            matchId,
            market: 'WINNER',
            pick: JSON.stringify({ market: 'WINNER', outcome }),
            stake: String(log.args.stake),
            createdAt: now,
          })
          .onConflictDoNothing()
          .run();
        indexed++;
      }
      from = to + 1n;
    }
    cursor = latest + 1n;
    return indexed;
  };
}
