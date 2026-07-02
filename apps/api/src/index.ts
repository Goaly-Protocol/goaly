import { ARBITRUM, type Outcome } from '@goaly/core';
import { createMarket, marketIdFor, settleMarket } from '@goaly/plugin-onchain';
import { createSportsProvider, parseOddsApiKeys } from '@goaly/plugin-odds';
import { KeyWallet } from '@goaly/plugin-wdk';
import { createApp } from './app';
import { createDb } from './db/client';
import { loadEnv } from './env';
import { PredictionService } from './services/prediction.service';
import { SyncService } from './services/sync.service';

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const oddsKeys = parseOddsApiKeys(env.THE_ODDS_API_KEYS, env.THE_ODDS_API_KEY);
const provider = createSportsProvider(oddsKeys);
const keyCount = Math.max(1, oddsKeys.length);

// When an oracle key is configured, finished matches auto-settle their on-chain market.
const oraclePk = env.ORACLE_PK;
const oracleWallet = oraclePk
  ? new KeyWallet(oraclePk as `0x${string}`, { provider: env.ARBITRUM_RPC_URL })
  : undefined;

const settleOnchain = oracleWallet
  ? async (matchId: string, result: Outcome) => {
      await settleMarket(oracleWallet, {
        pool: ARBITRUM.goaly.predictionPool as `0x${string}`,
        marketId: marketIdFor(matchId),
        result,
      });
    }
  : undefined;

const createMarketOnchain = oracleWallet
  ? async (matchId: string, closeTime: number) => {
      await createMarket(oracleWallet, {
        pool: ARBITRUM.goaly.predictionPool as `0x${string}`,
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
const app = createApp({ db, env, sync, predictions });

// Background sync — decoupled from user traffic so credits are spent on our schedule.
const SYNC_TICK_MS = 5 * 60 * 1000;
setInterval(() => {
  sync.tick().catch((error) => console.error('[sync] tick failed', error));
}, SYNC_TICK_MS);

console.log(
  `Goaly API listening on :${env.API_PORT} (provider: ${provider.name}, keys: ${keyCount})`,
);

export default { port: env.API_PORT, fetch: app.fetch };
