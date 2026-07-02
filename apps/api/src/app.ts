import { ARBITRUM, resolveOutcome } from '@goaly/core';
import {
  createArbitrumClient,
  marketIdFor,
  readGoUsdtBalance,
  settleMarket,
} from '@goaly/plugin-onchain';
import { resolveTeam } from '@goaly/plugin-teams';
import { KeyWallet } from '@goaly/plugin-wdk';
import { Scalar } from '@scalar/hono-api-reference';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { DB } from './db/client';
import { apiUsage, matches, predictions } from './db/schema';
import type { Env } from './env';
import { HttpError } from './lib/errors';
import { openApiDocument } from './openapi';
import { createIndexerClient } from './services/indexer';
import type { PredictionService } from './services/prediction.service';
import type { SyncService } from './services/sync.service';

export interface AppDeps {
  db: DB;
  env: Env;
  sync: SyncService;
  predictions: PredictionService;
}

const pickSchema = z.discriminatedUnion('market', [
  z.object({ market: z.literal('WINNER'), outcome: z.enum(['HOME', 'DRAW', 'AWAY']) }),
  z.object({
    market: z.literal('EXACT_SCORE'),
    homeScore: z.number().int().min(0),
    awayScore: z.number().int().min(0),
  }),
]);

const placeBody = z.object({
  userId: z.string().min(1),
  matchId: z.string().min(1),
  pick: pickSchema,
  stake: z.string().regex(/^\d+$/, 'stake must be an integer string of base units'),
});

const resultBody = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
});

/** Enrich a match row with resolved team metadata (name, FIFA code, flag). */
function withTeamMeta<T extends { homeTeam: string; awayTeam: string }>(row: T) {
  return {
    ...row,
    homeTeamMeta: resolveTeam(row.homeTeam),
    awayTeamMeta: resolveTeam(row.awayTeam),
  };
}

export function createApp(deps: AppDeps): Hono {
  const { db, sync, predictions: predictionService } = deps;
  const indexer = deps.env.INDEXER_URL ? createIndexerClient(deps.env.INDEXER_URL) : null;
  const app = new Hono();

  // CORS: allow the web app. Any localhost port in dev, plus configured production origins.
  const allowedOrigins = (deps.env.CORS_ORIGINS ?? 'https://goaly.fun,https://app.goaly.fun')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
        return allowedOrigins.includes(origin) ? origin : '';
      },
    }),
  );

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    if (err instanceof z.ZodError) return c.json({ error: 'validation', issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  // ── API docs (Scalar) ──
  app.get('/openapi.json', (c) => c.json(openApiDocument));
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Goaly API', theme: 'purple' }));

  app.get('/health', (c) => c.json({ ok: true, provider: sync ? 'ready' : 'none' }));

  // ── Matches (served from cache — never hits the odds API) ──
  app.get('/matches', (c) => {
    const rows = db.select().from(matches).orderBy(matches.kickoff).all();
    return c.json({ matches: rows.map(withTeamMeta) });
  });

  app.get('/matches/:id', (c) => {
    const row = db
      .select()
      .from(matches)
      .where(eq(matches.id, c.req.param('id')))
      .get();
    if (!row) throw new HttpError(404, 'match not found');
    return c.json(withTeamMeta(row));
  });

  // ── Predictions ──
  app.post('/predictions', async (c) => {
    const body = placeBody.parse(await c.req.json());
    const created = predictionService.placePrediction({
      userId: body.userId,
      matchId: body.matchId,
      pick: body.pick,
      stake: BigInt(body.stake),
    });
    return c.json(created, 201);
  });

  app.get('/predictions', (c) => {
    const userId = c.req.query('userId');
    if (!userId) throw new HttpError(400, 'userId query param required');
    const rows = db.select().from(predictions).where(eq(predictions.userId, userId)).all();
    const enriched = rows.map((prediction) => {
      const match = db.select().from(matches).where(eq(matches.id, prediction.matchId)).get();
      return { ...prediction, match: match ? withTeamMeta(match) : null };
    });
    return c.json({ predictions: enriched });
  });

  // ── On-chain position (reads GoalyVault via viem / @goaly/plugin-onchain) ──
  app.get('/positions/:address', async (c) => {
    const vaultAddress = deps.env.GOALY_VAULT_ADDRESS;
    if (!vaultAddress) throw new HttpError(501, 'GOALY_VAULT_ADDRESS not configured');
    const address = c.req.param('address');
    if (!/^0x[0-9a-fA-F]{40}$/.test(address))
      throw new HttpError(400, 'address must be a 20-byte hex');

    // Prefer the Ponder indexer (served from its DB, no RPC); fall back to a direct vault read.
    if (indexer) {
      try {
        const balance = await indexer.goUsdtBalance(address);
        return c.json({ address, goUsdt: (balance ?? 0n).toString(), source: 'indexer' });
      } catch (error) {
        console.warn('[positions] indexer unavailable, falling back to RPC', error);
      }
    }

    const client = createArbitrumClient(deps.env.ARBITRUM_RPC_URL);
    // goUSDT balance = redeemable USDT0 principal (1:1).
    const goUsdt = await readGoUsdtBalance(
      client,
      vaultAddress as `0x${string}`,
      address as `0x${string}`,
    );
    return c.json({ address, goUsdt: goUsdt.toString(), source: 'rpc' });
  });

  // ── Admin: sync, oracle result, settlement, credit usage ──
  app.post('/admin/sync', async (c) => c.json(await sync.tick()));

  app.post('/admin/matches/:id/result', async (c) => {
    const id = c.req.param('id');
    const body = resultBody.parse(await c.req.json());
    const existing = db.select().from(matches).where(eq(matches.id, id)).get();
    if (!existing) throw new HttpError(404, 'match not found');
    db.update(matches)
      .set({
        status: 'FINISHED',
        homeScore: body.homeScore,
        awayScore: body.awayScore,
        updatedAt: Date.now(),
      })
      .where(eq(matches.id, id))
      .run();
    return c.json({ ok: true });
  });

  app.post('/admin/matches/:id/settle', (c) =>
    c.json(predictionService.settleMatch(c.req.param('id'))),
  );

  // Settle the corresponding on-chain PredictionPool market from the finished match result.
  app.post('/admin/matches/:id/settle-onchain', async (c) => {
    const oraclePk = deps.env.ORACLE_PK;
    if (!oraclePk) throw new HttpError(501, 'ORACLE_PK not configured');
    const matchId = c.req.param('id');
    const row = db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!row) throw new HttpError(404, 'match not found');
    if (row.status !== 'FINISHED' || row.homeScore === null || row.awayScore === null) {
      throw new HttpError(409, 'match has no final result yet');
    }
    const result = resolveOutcome({ homeScore: row.homeScore, awayScore: row.awayScore });
    const marketId = marketIdFor(matchId);
    const wallet = new KeyWallet(oraclePk as `0x${string}`, {
      provider: deps.env.ARBITRUM_RPC_URL,
    });
    const txHash = await settleMarket(wallet, {
      pool: ARBITRUM.goaly.predictionPool as `0x${string}`,
      marketId,
      result,
    });
    return c.json({ matchId, marketId, result, txHash });
  });

  app.get('/admin/usage', (c) => {
    const rows = db.select().from(apiUsage).all();
    const totalCost = rows.reduce((acc, row) => acc + row.cost, 0);
    const last = db.select().from(apiUsage).orderBy(desc(apiUsage.id)).limit(1).get();
    return c.json({
      calls: rows.length,
      totalCost,
      lastRemaining: last?.remaining ?? null,
      estimatedCreditsRemaining: sync.creditsRemaining(),
    });
  });

  return app;
}
