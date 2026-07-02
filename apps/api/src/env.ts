import { z } from 'zod';

const schema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().default('./data/goaly.db'),

  // The Odds API (https://the-odds-api.com). Optional — falls back to the mock provider.
  // Provide ONE key via THE_ODDS_API_KEY, or MANY (comma-separated) via THE_ODDS_API_KEYS
  // for rotation/fallback. Each free key = 500 credits/month, so N keys ≈ N×500 headroom.
  THE_ODDS_API_KEY: z.string().optional(),
  THE_ODDS_API_KEYS: z.string().optional(),
  ODDS_SPORT_KEY: z.string().default('soccer_fifa_world_cup'),
  ODDS_REGION: z.string().default('eu'),
  ODDS_MARKETS: z.string().default('h2h'),

  // Credit budget (free tier = 500/month). The sync service never exceeds this.
  ODDS_MONTHLY_CREDITS: z.coerce.number().int().default(500),
  /** Credits held back for settlement (scores) so odds refreshes can't starve it. */
  ODDS_CREDIT_RESERVE: z.coerce.number().int().default(80),
  /** Minimum ms between odds refreshes (odds are expensive: markets × regions). */
  ODDS_REFRESH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .default(6 * 60 * 60 * 1000),
  /** Minimum ms between scores polls. */
  ODDS_SCORES_INTERVAL_MS: z.coerce
    .number()
    .int()
    .default(30 * 60 * 1000),
  /** Only poll scores for matches whose kickoff + this buffer (s) has passed. */
  ODDS_SETTLE_BUFFER_S: z.coerce
    .number()
    .int()
    .default(2 * 60 * 60),

  // Protocol fee on pot payouts, in basis points (250 = 2.5%).
  PROTOCOL_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(250),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return schema.parse(source);
}
