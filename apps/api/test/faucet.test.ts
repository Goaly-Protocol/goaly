import { MockSportsProvider } from '@goaly/plugin-odds';
import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { createDb } from '../src/db/client';
import { faucetDrips } from '../src/db/schema';
import { loadEnv } from '../src/env';
import { PredictionService } from '../src/services/prediction.service';
import { SyncService } from '../src/services/sync.service';

const now = () => 1_000_000;

// A valid-format (but throwaway) secp256k1 key so KeyWallet can be constructed. Guardrails
// short-circuit before it ever signs or hits the network in these tests.
const DUMMY_PK = `0x${'11'.repeat(32)}`;
const ADDRESS = '0x3b4f0135465d444a5bd06ab90fc59b73916c85f5';

/** Build an app + db. Pass `FAUCET_PK` to enable the (still network-inert) faucet. */
function setup(extraEnv: Record<string, string> = {}) {
  const env = loadEnv({
    DATABASE_URL: ':memory:',
    PROTOCOL_FEE_BPS: '250',
    ...extraEnv,
  } as unknown as NodeJS.ProcessEnv);
  const { db } = createDb(':memory:');
  const sync = new SyncService({ db, provider: new MockSportsProvider([]), env, now });
  const predictions = new PredictionService(db, BigInt(env.PROTOCOL_FEE_BPS), now);
  const app = createApp({ db, env, sync, predictions, now });
  return { app, db };
}

type App = ReturnType<typeof createApp>;

async function drip(app: App, address: string) {
  const res = await app.request('/faucet/gas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('POST /faucet/gas', () => {
  test('is gracefully disabled when FAUCET_PK is unset (200)', async () => {
    const { app } = setup();
    const r = await drip(app, ADDRESS);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ funded: false, reason: 'faucet_disabled' });
  });

  test('is idempotent — an address already dripped returns already_funded (200)', async () => {
    // Enable the faucet so the disabled guardrail passes; the already_funded check short-circuits
    // BEFORE any balance read / send, so no network call is made.
    const { app, db } = setup({ FAUCET_PK: DUMMY_PK });
    db.insert(faucetDrips)
      .values({
        address: ADDRESS,
        txHash: `0x${'ab'.repeat(32)}`,
        amount: '300000000000000',
        drippedAt: now(),
      })
      .run();

    const r = await drip(app, ADDRESS);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ funded: false, reason: 'already_funded' });
  });

  test('lowercases the address before the idempotency lookup', async () => {
    const { app, db } = setup({ FAUCET_PK: DUMMY_PK });
    db.insert(faucetDrips)
      .values({ address: ADDRESS, txHash: null, amount: '0', drippedAt: now() })
      .run();

    const r = await drip(app, ADDRESS.toUpperCase());
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ funded: false, reason: 'already_funded' });
  });

  test('rejects a malformed address (400)', async () => {
    const { app } = setup();
    const r = await drip(app, 'not-an-address');
    expect(r.status).toBe(400);
  });
});
