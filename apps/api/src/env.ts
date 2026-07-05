import { z } from 'zod';

const schema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().default('./data/goaly.db'),

  // On-chain reads (GoalyVault on Arbitrum One)
  ARBITRUM_RPC_URL: z.string().default('https://arb1.arbitrum.io/rpc'),
  GOALY_VAULT_ADDRESS: z.string().optional(),
  /** Ponder indexer base URL (GraphQL at `${INDEXER_URL}/graphql`). Defaults to the live
   *  deployment so it works out of the box; override via env for local/staging indexers. */
  INDEXER_URL: z.string().url().default('https://indexer.goaly.fun'),
  /** Comma-separated production origins allowed by CORS (localhost is always allowed in dev). */
  CORS_ORIGINS: z.string().optional(),
  /** Oracle private key for on-chain market settlement (server-side, ORACLE_ROLE). */
  ORACLE_PK: z.string().optional(),

  // Gas faucet — drips a little ETH to a freshly-created embedded account so the user can transact
  // (approve/deposit) without first funding gas themselves.
  /** Private key of the funded faucet wallet. When absent the faucet is DISABLED. */
  FAUCET_PK: z.string().optional(),
  /** ETH sent per drip. */
  FAUCET_DRIP_ETH: z.string().default('0.0001'),
  /** Skip the drip if the account already holds ≥ this much ETH. */
  FAUCET_MIN_BALANCE_ETH: z.string().default('0.0002'),
  /** Max drips per UTC day (anti-drain cap). */
  FAUCET_DAILY_CAP: z.coerce.number().int().default(300),

  /** OpenAI key — enables the yield agent's LLM reasoning layer. Optional. */
  OPENAI_KEY: z.string().optional(),

  // The Odds API (https://the-odds-api.com). Optional — falls back to the mock provider.
  // Provide ONE key via THE_ODDS_API_KEY, or MANY (comma-separated) via THE_ODDS_API_KEYS
  // for rotation/fallback. Each free key = 500 credits/month, so N keys ≈ N×500 headroom.
  THE_ODDS_API_KEY: z.string().optional(),
  THE_ODDS_API_KEYS: z.string().optional(),
  /** Goaly Odds feed (https://odds.goaly.fun) — free, no auth. When set, it is the data source
   *  (preferred over The Odds API). Set empty to fall back to The Odds API / mock. */
  GOALY_ODDS_URL: z.string().default('https://odds.goaly.fun'),
  /** API key for the Goaly Odds feed (sent as X-API-Key; required by the live API). */
  ODDS_API_KEY: z.string().optional(),
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
  /** Only fetch odds for matches kicking off within this window (s) — lineups drop ~1h out. */
  ODDS_FETCH_BEFORE_S: z.coerce
    .number()
    .int()
    .default(60 * 60),

  // Protocol fee on pot payouts, in basis points (250 = 2.5%).
  PROTOCOL_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(250),

  // Yield Agent — autonomous Morpho rebalancing via a WDK agent wallet (uses ORACLE_PK's MANAGER_ROLE).
  /** Minimum APY improvement (bps) before the agent migrates the vault's backing. */
  AGENT_MIN_APY_GAIN_BPS: z.coerce.number().int().default(30),
  /** Risk floor — never migrate INTO a Morpho vault thinner than this (USD TVL). */
  AGENT_MIN_TVL_USD: z.coerce.number().default(10),
  /** When true the agent executes migrations on its own; otherwise it is advisory (decides only). */
  AGENT_AUTO_REBALANCE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return schema.parse(source);
}
