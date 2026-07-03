import { ARBITRUM, resolveOutcome } from '@goaly/core';
import { marketIdFor, settleMarket } from '@goaly/plugin-onchain';
import { LIVE_MATCH_WINDOW_S } from '@goaly/plugin-odds';
import { resolveTeam } from '@goaly/plugin-teams';
import { KeyWallet } from '@goaly/plugin-wdk';
import { Scalar } from '@scalar/hono-api-reference';
import { and, desc, eq, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { DB } from './db/client';
import { apiUsage, matches, oddsCache, predictions } from './db/schema';
import type { Env } from './env';
import { toBracketsViewer } from './lib/brackets-viewer';
import { HttpError } from './lib/errors';
import { isRealMatch } from './lib/match-filter';
import {
  closingWinningOddsBps,
  frozenOdds,
  type MatchOdds,
  parseH2hOdds,
  winningOddsBps,
} from './lib/odds';
import type { CrestService } from './services/crest.service';
import { StandingsService } from './services/standings.service';
import type { YieldAgentService } from './services/yield-agent.service';
import { openApiDocument } from './openapi';
import type { PredictionService } from './services/prediction.service';
import type { SyncService } from './services/sync.service';

export interface AppDeps {
  db: DB;
  env: Env;
  sync: SyncService;
  predictions: PredictionService;
  /** Optional — injected in tests; defaults to a live FIFA-backed instance. */
  standings?: StandingsService;
  /** Optional — the autonomous yield-rebalancing agent (present when ORACLE_PK is set). */
  yieldAgent?: YieldAgentService;
  /** Optional — resolves club crests (national teams use flags directly). */
  crests?: CrestService;
  /** Optional clock override (tests); defaults to the wall clock. */
  now?: () => number;
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

/** National-team meta (name, FIFA code, flag), else a club crest from the cache, else null. */
function teamMetaFor(name: string, crests?: CrestService) {
  const national = resolveTeam(name);
  if (national) return national;
  const crest = crests?.get(name);
  if (!crest) return null;
  return { name, code: name.slice(0, 3).toUpperCase(), iso: '', logo: crest };
}

/** Enrich a match row with resolved team metadata (national flag or club crest). */
function withTeamMeta<T extends { homeTeam: string; awayTeam: string }>(
  row: T,
  crests?: CrestService,
) {
  return {
    ...row,
    homeTeamMeta: teamMetaFor(row.homeTeam, crests),
    awayTeamMeta: teamMetaFor(row.awayTeam, crests),
  };
}

/** Cached h2h odds for a match (null when none synced). */
function matchOdds(db: DB, matchId: string, homeTeam: string, awayTeam: string): MatchOdds | null {
  const cached = db.select().from(oddsCache).where(eq(oddsCache.matchId, matchId)).get();
  return cached ? parseH2hOdds(cached.data, homeTeam, awayTeam) : null;
}

function withMatchDetail<
  T extends {
    id: string;
    homeTeam: string;
    awayTeam: string;
    closingHomeBps: number | null;
    closingDrawBps: number | null;
    closingAwayBps: number | null;
  },
>(db: DB, row: T, crests?: CrestService) {
  // Live cache first (realtime — odds move during the match), frozen closing odds as fallback.
  return {
    ...withTeamMeta(row, crests),
    odds: matchOdds(db, row.id, row.homeTeam, row.awayTeam) ?? frozenOdds(row),
  };
}

export function createApp(deps: AppDeps): Hono {
  const { db, sync, predictions: predictionService } = deps;
  const standings = deps.standings ?? new StandingsService();
  const yieldAgent = deps.yieldAgent;
  const crests = deps.crests;
  const now = deps.now ?? (() => Date.now());
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

  // ⚽ favicon (SVG) so the browser tab + link unfurls show an icon.
  const FAVICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚽</text></svg>';
  app.get('/favicon.ico', (c) =>
    c.body(FAVICON, 200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    }),
  );
  app.get('/favicon.svg', (c) =>
    c.body(FAVICON, 200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    }),
  );

  // Root: a small JSON status so hitting the domain shows something useful.
  app.get('/', (c) =>
    c.json({
      name: 'Goaly API',
      status: 'ok',
      description:
        'No-loss football predictions on Arbitrum — matches, live odds, standings, and an autonomous WDK yield agent.',
      docs: '/docs',
      endpoints: ['/matches', '/standings', '/bracket', '/agent', '/predictions', '/health'],
    }),
  );

  // ── API docs (Scalar) ──
  app.get('/openapi.json', (c) => c.json(openApiDocument));
  app.get(
    '/docs',
    Scalar({
      url: '/openapi.json',
      pageTitle: 'Goaly API',
      theme: 'purple',
      favicon: '/favicon.svg',
    }),
  );

  app.get('/health', (c) => c.json({ ok: true, provider: sync ? 'ready' : 'none' }));

  // ── Matches (served from cache — never hits the odds API) ──
  app.get('/matches', (c) => {
    // Bettable only: still SCHEDULED and within the live window (finished/dropped ones are excluded).
    const cutoff = Math.floor(now() / 1000) - LIVE_MATCH_WINDOW_S;
    const rows = db
      .select()
      .from(matches)
      .where(and(eq(matches.status, 'SCHEDULED'), gt(matches.kickoff, cutoff)))
      .orderBy(matches.kickoff)
      .all()
      // Hide aggregate/placeholder feed rows ("Home Team - Friday - 3 Matches") — not real fixtures.
      .filter((row) => isRealMatch(row.homeTeam, row.awayTeam));
    return c.json({ matches: rows.map((row) => withMatchDetail(db, row, crests)) });
  });

  app.get('/matches/:id', (c) => {
    const row = db
      .select()
      .from(matches)
      .where(eq(matches.id, c.req.param('id')))
      .get();
    if (!row) throw new HttpError(404, 'match not found');
    return c.json(withMatchDetail(db, row, crests));
  });

  // ── Standings + bracket (FIFA data API — free, cached) ──
  app.get('/standings', async (c) => {
    const groups = await standings.get();
    return c.json({
      groups: groups.map((g) => ({
        ...g,
        rows: g.rows.map((r) => ({ ...r, teamMeta: resolveTeam(r.team) })),
      })),
    });
  });

  app.get('/bracket', async (c) => {
    const rounds = await standings.bracket();
    return c.json({
      rounds: rounds.map((round) => ({
        ...round,
        matches: round.matches.map((m) => ({
          ...m,
          homeMeta: m.home ? resolveTeam(m.home) : null,
          awayMeta: m.away ? resolveTeam(m.away) : null,
        })),
      })),
    });
  });

  // brackets-viewer.js data model (real single-elimination bracket render).
  app.get('/bracket/viewer', async (c) => {
    const rounds = await standings.bracket();
    return c.json(
      toBracketsViewer(rounds, (team) => {
        const meta = resolveTeam(team);
        return {
          name: meta?.code ?? team,
          imageUrl: meta?.iso ? `https://flagcdn.com/w40/${meta.iso}.png` : null,
        };
      }),
    );
  });

  // ── Yield Agent (autonomous Morpho rebalancing via a WDK agent wallet) ──
  app.get('/agent', async (c) => {
    if (!yieldAgent) return c.json({ enabled: false });
    const status = yieldAgent.getStatus().lastRunAt
      ? yieldAgent.getStatus()
      : await yieldAgent.run(false);
    return c.json({ enabled: true, ...status });
  });

  app.post('/agent/run', async (c) => {
    if (!yieldAgent) throw new HttpError(501, 'yield agent not configured');
    return c.json(await yieldAgent.run(false)); // refresh decision, no execution
  });

  app.post('/agent/rebalance', async (c) => {
    if (!yieldAgent) throw new HttpError(501, 'yield agent not configured');
    if (!yieldAgent.getStatus().canExecute) throw new HttpError(501, 'agent wallet not configured');
    return c.json(await yieldAgent.run(true)); // decide + execute the migration on-chain
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
      return { ...prediction, match: match ? withTeamMeta(match, crests) : null };
    });
    return c.json({ predictions: enriched });
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
    // Prefer the frozen closing odds; fall back to live cache if not frozen yet.
    const oddsBps =
      closingWinningOddsBps(row, result) ??
      winningOddsBps(matchOdds(db, matchId, row.homeTeam, row.awayTeam), result);
    const wallet = new KeyWallet(oraclePk as `0x${string}`, {
      provider: deps.env.ARBITRUM_RPC_URL,
    });
    const txHash = await settleMarket(wallet, {
      pool: ARBITRUM.goaly.pool as `0x${string}`,
      marketId,
      result,
      winningOddsBps: oddsBps,
    });
    return c.json({ matchId, marketId, result, winningOddsBps: oddsBps.toString(), txHash });
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
