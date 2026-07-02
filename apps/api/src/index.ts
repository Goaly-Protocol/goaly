import { createApp } from './app';
import { createDb } from './db/client';
import { loadEnv } from './env';
import { createSportsProvider, oddsApiKeys } from './providers/sports';
import { PredictionService } from './services/prediction.service';
import { SyncService } from './services/sync.service';

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const provider = createSportsProvider(env);
const keyCount = Math.max(1, oddsApiKeys(env).length);

const sync = new SyncService({ db, provider, env, keyCount });
const predictions = new PredictionService(db, BigInt(env.PROTOCOL_FEE_BPS));
const app = createApp({ db, env, sync, predictions });

// Background sync — decoupled from user traffic so credits are spent on our schedule.
const SYNC_TICK_MS = 5 * 60 * 1000;
setInterval(() => {
  sync.tick().catch((error) => console.error('[sync] tick failed', error));
}, SYNC_TICK_MS);

console.log(
  `GoalYield API listening on :${env.API_PORT} (provider: ${provider.name}, keys: ${keyCount})`,
);

export default { port: env.API_PORT, fetch: app.fetch };
