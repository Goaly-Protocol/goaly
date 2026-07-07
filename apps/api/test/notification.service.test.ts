import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/db/client';
import { pushSubscriptions } from '../src/db/schema';
import { type Env, loadEnv } from '../src/env';
import { messages } from '../src/services/notification-messages';
import { createNotificationService } from '../src/services/notification.service';

/** Env without VAPID keys → push is DISABLED, so send/notify never touch the network. */
function env(extra: Record<string, string> = {}): Env {
  return loadEnv({ DATABASE_URL: ':memory:', ...extra } as unknown as NodeJS.ProcessEnv);
}

const sub = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
});

describe('createNotificationService', () => {
  test('is disabled without VAPID keys (no public key)', () => {
    const { db } = createDb(':memory:');
    const svc = createNotificationService({ db, env: env() });
    expect(svc.enabled).toBe(false);
    expect(svc.publicKey).toBe(null);
  });

  test('subscribe stores a row and reports created=true only the first time', () => {
    const { db } = createDb(':memory:');
    const svc = createNotificationService({ db, env: env(), now: () => 1_234 });

    const first = svc.subscribe('alice', sub('https://push.example/abc'));
    expect(first).toEqual({ created: true });

    const row = db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, 'https://push.example/abc'))
      .get();
    expect(row).toMatchObject({
      endpoint: 'https://push.example/abc',
      userId: 'alice',
      p256dh: 'p256dh-key',
      auth: 'auth-secret',
      createdAt: 1_234,
    });

    // Re-subscribing the same endpoint upserts (no duplicate) and reports created=false.
    const again = svc.subscribe('alice', sub('https://push.example/abc'));
    expect(again).toEqual({ created: false });
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
  });

  test('unsubscribe deletes the row', () => {
    const { db } = createDb(':memory:');
    const svc = createNotificationService({ db, env: env() });
    svc.subscribe('bob', sub('https://push.example/xyz'));
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);

    svc.unsubscribe('https://push.example/xyz');
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
  });

  test('send is a no-op returning 0 when disabled (never hits the network)', async () => {
    const { db } = createDb(':memory:');
    const svc = createNotificationService({ db, env: env() });
    svc.subscribe('carol', sub('https://push.example/1'));
    expect(await svc.send('carol', messages.welcome())).toBe(0);
  });

  test('notify never throws when disabled', () => {
    const { db } = createDb(':memory:');
    const svc = createNotificationService({ db, env: env() });
    svc.subscribe('dave', sub('https://push.example/2'));
    expect(() => svc.notify('dave', messages.welcome())).not.toThrow();
  });
});
