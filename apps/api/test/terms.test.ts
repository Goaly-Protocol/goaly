import { MockSportsProvider } from '@goaly/plugin-odds';
import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { createDb } from '../src/db/client';
import { loadEnv } from '../src/env';
import { PredictionService } from '../src/services/prediction.service';
import { SyncService } from '../src/services/sync.service';

const now = () => 1_000_000;

function setup() {
  const env = loadEnv({
    DATABASE_URL: ':memory:',
    PROTOCOL_FEE_BPS: '250',
  } as unknown as NodeJS.ProcessEnv);
  const { db } = createDb(':memory:');
  const sync = new SyncService({ db, provider: new MockSportsProvider([]), env, now });
  const predictions = new PredictionService(db, BigInt(env.PROTOCOL_FEE_BPS), now);
  return createApp({ db, env, sync, predictions, now });
}

const ADDRESS = '0x3b4f0135465d444a5bd06ab90fc59b73916c85f5';
const VERSION = '2026-07-01';
const SIG = `0x${'ab'.repeat(65)}`; // 65-byte EIP-712 signature

type App = ReturnType<typeof createApp>;

async function post(app: App, path: string, body: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function acceptancesFor(app: App, address: string) {
  const res = await app.request(`/terms/${address}`);
  const json = (await res.json()) as {
    acceptances: Array<{ address: string; version: string; signature: string }>;
  };
  return json.acceptances;
}

describe('terms acceptance', () => {
  test('records a signed acceptance and reads it back (case-insensitive)', async () => {
    const app = setup();
    const r = await post(app, '/terms/accept', {
      address: ADDRESS.toUpperCase(),
      version: VERSION,
      signature: SIG,
    });
    expect(r.status).toBe(201);
    expect(r.json.ok).toBe(true);

    const rows = await acceptancesFor(app, ADDRESS);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.address).toBe(ADDRESS.toLowerCase());
    expect(rows[0]?.version).toBe(VERSION);
    expect(rows[0]?.signature).toBe(SIG);
  });

  test('is idempotent per (address, version) — re-posting does not duplicate', async () => {
    const app = setup();
    await post(app, '/terms/accept', { address: ADDRESS, version: VERSION, signature: SIG });
    await post(app, '/terms/accept', { address: ADDRESS, version: VERSION, signature: SIG });
    expect(await acceptancesFor(app, ADDRESS)).toHaveLength(1);
  });

  test('a new version is recorded as a separate acceptance', async () => {
    const app = setup();
    await post(app, '/terms/accept', { address: ADDRESS, version: '2026-07-01', signature: SIG });
    await post(app, '/terms/accept', { address: ADDRESS, version: '2027-01-01', signature: SIG });
    expect(await acceptancesFor(app, ADDRESS)).toHaveLength(2);
  });

  test('rejects a malformed address', async () => {
    const app = setup();
    const r = await post(app, '/terms/accept', {
      address: 'not-an-address',
      version: VERSION,
      signature: SIG,
    });
    expect(r.status).toBe(400);
  });
});
