import { randomUUID } from 'node:crypto';
import {
  type Match as CoreMatch,
  type Pick,
  type Stake,
  distributePot,
  isOpenForPredictions,
  isPredictionCorrect,
} from '@goaly/core';
import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { matches, predictions } from '../db/schema';
import { HttpError } from '../lib/errors';

type MatchRow = typeof matches.$inferSelect;

export interface PlacePredictionInput {
  userId: string;
  matchId: string;
  pick: Pick;
  stake: bigint;
  /**
   * The on-chain predict transaction hash. Used as the row id so this client record and the
   * on-chain `Predicted` event indexed by the bet-indexer converge on ONE row (a predict is one
   * event per tx) instead of duplicating. Falls back to a random id for non-on-chain callers.
   */
  txHash?: string;
}

export interface SettlementSummary {
  matchId: string;
  pot: string;
  fee: string;
  winners: number;
  payouts: { id: string; payout: string }[];
  dust: string;
}

function toCoreMatch(row: MatchRow): CoreMatch {
  return {
    id: row.id,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    kickoff: row.kickoff,
    round: row.round,
    status: row.status as CoreMatch['status'],
    ...(row.homeScore !== null && row.awayScore !== null
      ? { result: { homeScore: row.homeScore, awayScore: row.awayScore } }
      : {}),
  };
}

export class PredictionService {
  private readonly now: () => number;

  constructor(
    private readonly db: DB,
    private readonly feeBps: bigint,
    now?: () => number,
  ) {
    this.now = now ?? (() => Date.now());
  }

  placePrediction(input: PlacePredictionInput): { id: string } {
    if (input.stake <= 0n) throw new HttpError(400, 'stake must be positive');

    const row = this.db.select().from(matches).where(eq(matches.id, input.matchId)).get();
    if (!row) throw new HttpError(404, 'match not found');
    if (!isOpenForPredictions(toCoreMatch(row), Math.floor(this.now() / 1000))) {
      throw new HttpError(409, 'predictions are closed for this match');
    }

    // Key on the predict tx hash so the client record + the on-chain-indexed row dedupe to one.
    const id = input.txHash ? input.txHash.toLowerCase() : randomUUID();
    this.db
      .insert(predictions)
      .values({
        id,
        userId: input.userId,
        matchId: input.matchId,
        market: input.pick.market,
        pick: JSON.stringify(input.pick),
        stake: input.stake.toString(),
        createdAt: this.now(),
      })
      .onConflictDoNothing()
      .run();
    return { id };
  }

  /**
   * Settle a finished match: correct predictions split the credit-stake pot
   * (minus protocol fee) pro-rata. Losing stakes are what fund the winners; a
   * player's *principal* is untouched — that lives on-chain and self-repays.
   */
  settleMatch(matchId: string): SettlementSummary {
    const row = this.db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!row) throw new HttpError(404, 'match not found');
    if (row.status !== 'FINISHED' || row.homeScore === null || row.awayScore === null) {
      throw new HttpError(409, 'match has no final result yet');
    }
    const result = { homeScore: row.homeScore, awayScore: row.awayScore };

    const open = this.db
      .select()
      .from(predictions)
      .where(and(eq(predictions.matchId, matchId), eq(predictions.settled, false)))
      .all();

    const pot = open.reduce((acc, prediction) => acc + BigInt(prediction.stake), 0n);
    const winners: Stake[] = [];
    for (const prediction of open) {
      const pick = JSON.parse(prediction.pick) as Pick;
      if (isPredictionCorrect(pick, result)) {
        winners.push({ id: prediction.id, stake: BigInt(prediction.stake) });
      }
    }

    const distribution = distributePot(pot, winners, this.feeBps);
    const payoutById = new Map(distribution.payouts.map((p) => [p.id, p.payout]));

    for (const prediction of open) {
      const payout = payoutById.get(prediction.id) ?? 0n;
      this.db
        .update(predictions)
        .set({ settled: true, won: payoutById.has(prediction.id), payout: payout.toString() })
        .where(eq(predictions.id, prediction.id))
        .run();
    }

    return {
      matchId,
      pot: pot.toString(),
      fee: distribution.fee.toString(),
      winners: winners.length,
      payouts: distribution.payouts.map((p) => ({ id: p.id, payout: p.payout.toString() })),
      dust: distribution.dust.toString(),
    };
  }
}
