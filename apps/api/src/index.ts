import { ARBITRUM, type Outcome } from '@goaly/core';
import {
  createArbitrumClient,
  createMarket,
  marketIdFor,
  settleMarket,
} from '@goaly/plugin-onchain';
import { createSportsProvider, parseOddsApiKeys } from '@goaly/plugin-odds';
import { KeyWallet } from '@goaly/plugin-wdk';
import { eq } from 'drizzle-orm';
import { createApp } from './app';
import { createDb } from './db/client';
import { matches, oddsCache } from './db/schema';
import { loadEnv } from './env';
import { CrestService } from './services/crest.service';
import { createFaucet } from './services/faucet';
import { closingWinningOddsBps, parseH2hOdds, winningOddsBps } from './lib/odds';
import { PredictionService } from './services/prediction.service';
import { SyncService } from './services/sync.service';
import { createBetIndexer } from './services/bet-indexer';
import { YieldAgentService } from './services/yield-agent.service';

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const oddsKeys = parseOddsApiKeys(env.THE_ODDS_API_KEYS, env.THE_ODDS_API_KEY);
const provider = createSportsProvider(oddsKeys, env.GOALY_ODDS_URL || undefined, env.ODDS_API_KEY);
const keyCount = Math.max(1, oddsKeys.length);

// When an oracle key is configured, finished matches auto-settle their on-chain market.
const oraclePk = env.ORACLE_PK;
const oracleWallet = oraclePk
  ? new KeyWallet(oraclePk as `0x${string}`, { provider: env.ARBITRUM_RPC_URL })
  : undefined;

const settleOnchain = oracleWallet
  ? async (matchId: string, result: Outcome) => {
      const row = db.select().from(matches).where(eq(matches.id, matchId)).get();
      const cached = db.select().from(oddsCache).where(eq(oddsCache.matchId, matchId)).get();
      const liveOdds = row && cached ? parseH2hOdds(cached.data, row.homeTeam, row.awayTeam) : null;
      const oddsBps =
        (row ? closingWinningOddsBps(row, result) : null) ?? winningOddsBps(liveOdds, result);
      await settleMarket(oracleWallet, {
        markets: ARBITRUM.goaly.markets as `0x${string}`,
        marketId: marketIdFor(matchId),
        result,
        winningOddsBps: oddsBps,
      });
    }
  : undefined;

const createMarketOnchain = oracleWallet
  ? async (matchId: string, closeTime: number) => {
      await createMarket(oracleWallet, {
        markets: ARBITRUM.goaly.markets as `0x${string}`,
        marketId: marketIdFor(matchId),
        closeTime: BigInt(closeTime),
      });
    }
  : undefined;

const sync = new SyncService({
  db,
  provider,
  env,
  keyCount,
  ...(settleOnchain ? { settleOnchain } : {}),
  ...(createMarketOnchain ? { createMarketOnchain } : {}),
});
const predictions = new PredictionService(db, BigInt(env.PROTOCOL_FEE_BPS));

// Autonomous yield agent — watches Morpho USDT0 vaults + advises on the vault's backing (WDK wallet).
const yieldAgent = new YieldAgentService({
  client: createArbitrumClient(env.ARBITRUM_RPC_URL),
  vault: ARBITRUM.goaly.vault as `0x${string}`,
  candidateVaults: [
    ARBITRUM.morphoVaults.gauntletUsdt0Core,
    ARBITRUM.morphoVaults.steakhousePrimeUsdt0,
    ARBITRUM.morphoVaults.steakhouseHighYieldUsdt0,
    // Cross-asset (same chain) — reachable via the vault's on-chain USDT0↔USDC swap.
    ARBITRUM.morphoVaults.gauntletUsdcCore,
    ARBITRUM.morphoVaults.steakhouseHighYieldUsdc,
  ],
  params: { minApyGainBps: env.AGENT_MIN_APY_GAIN_BPS, minTvlUsd: env.AGENT_MIN_TVL_USD },
  ...(oracleWallet ? { wallet: oracleWallet } : {}),
  ...(env.OPENAI_KEY ? { openaiKey: env.OPENAI_KEY } : {}),
  // Advisory only — the new vault has a single whitelisted strategy, so there is nothing to
  // auto-rebalance yet. Keep the decision/display, but never execute on-chain.
  autoExecute: false,
});

// Club crests (national teams use flags directly); resolved in the background + cached.
const crests = new CrestService(db);

// Gas faucet — drips a little ETH to fresh embedded accounts (disabled unless FAUCET_PK is set).
const faucet = createFaucet({ db, env });

const app = createApp({ db, env, sync, predictions, yieldAgent, crests, faucet });

// Index on-chain bets (Predicted) into the DB so a wallet's bets always show, even if the
// client's off-chain record POST failed. The chain is the source of truth.
const indexBets = createBetIndexer(db, env.ARBITRUM_RPC_URL);
const BET_TICK_MS = 20 * 1000;
indexBets()
  .then((n) => n && console.log(`[bets] indexed ${n} on-chain bet(s)`))
  .catch((error) => console.error('[bets] initial index failed', error));
setInterval(() => {
  indexBets().catch((error) => console.error('[bets] index failed', error));
}, BET_TICK_MS);

// Background sync — decoupled from user traffic so credits are spent on our schedule.
const SYNC_TICK_MS = 5 * 60 * 1000;
setInterval(() => {
  sync.tick().catch((error) => console.error('[sync] tick failed', error));
}, SYNC_TICK_MS);

// Realtime odds — poll the feed like a websocket (no cache), one fetch updates every bettable match.
const ODDS_TICK_MS = 3 * 1000;
setInterval(() => {
  sync
    .syncOdds()
    .then(() => sync.freezeClosingOdds())
    .catch((error) => console.error('[odds] tick failed', error));
}, ODDS_TICK_MS);

// The yield agent re-evaluates on its own cadence (advisory unless AGENT_AUTO_REBALANCE=true).
const AGENT_TICK_MS = 15 * 60 * 1000;
yieldAgent.run().catch((error) => console.error('[agent] initial run failed', error));
setInterval(() => {
  yieldAgent.run().catch((error) => console.error('[agent] run failed', error));
}, AGENT_TICK_MS);

// Resolve club crests in the background (bounded batches; national teams use flags).
const CREST_TICK_MS = 20 * 1000;
setInterval(() => {
  const teams = db.select({ home: matches.homeTeam, away: matches.awayTeam }).from(matches).all();
  const names = teams.flatMap((m) => [m.home, m.away]);
  crests.resolve(names).catch((error) => console.error('[crest] resolve failed', error));
}, CREST_TICK_MS);

console.log(
  `Goaly API listening on :${env.API_PORT} (provider: ${provider.name}, keys: ${keyCount})`,
);

export default { port: env.API_PORT, fetch: app.fetch };
