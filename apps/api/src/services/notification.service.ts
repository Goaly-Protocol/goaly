import { eq } from 'drizzle-orm';
import webpush, { WebPushError } from 'web-push';
import type { DB } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import type { Env } from '../env';
import type { NotificationPayload } from './notification-messages';

/** A browser push subscription, exactly as `JSON.stringify(PushSubscription)` yields it. */
export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * The narrow surface the {@link PredictionService} depends on: fire-and-forget delivery only. Keeps
 * the service loosely coupled — it never needs the subscribe/send plumbing.
 */
export interface Notifier {
  notify(userId: string, payload: NotificationPayload): void;
}

export interface NotificationService extends Notifier {
  /** True only when both VAPID keys are configured — otherwise everything is a graceful no-op. */
  enabled: boolean;
  /** The VAPID public key the browser needs to subscribe, or null when push is disabled. */
  publicKey: string | null;
  /** Upsert a subscription for a user. `created` is true when the endpoint was new. */
  subscribe(userId: string, sub: WebPushSubscription, now?: number): { created: boolean };
  /** Remove a subscription by its endpoint (e.g. the user turned notifications off). */
  unsubscribe(endpoint: string): void;
  /** Deliver a payload to every subscription of a user; returns how many were delivered. */
  send(userId: string, payload: NotificationPayload): Promise<number>;
}

export interface NotificationDeps {
  db: DB;
  env: Env;
  now?: () => number;
}

/** True when the push endpoint is gone for good and the subscription should be pruned. */
function isGone(err: unknown): boolean {
  return err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410);
}

/**
 * Web Push (VAPID) delivery. When the key pair is absent, push is DISABLED and every method is a
 * graceful no-op — subscriptions still store (harmless), but `send`/`notify` deliver nothing. Kept
 * separate from the copy ({@link notification-messages}) so wording and delivery evolve apart.
 */
export function createNotificationService({ db, env, now }: NotificationDeps): NotificationService {
  const clock = now ?? (() => Date.now());
  const publicKey = env.VAPID_PUBLIC_KEY ?? null;
  const privateKey = env.VAPID_PRIVATE_KEY ?? null;
  const enabled = Boolean(publicKey && privateKey);

  // Configure the VAPID identity once. Only reachable when both keys are present.
  if (enabled && publicKey && privateKey) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, publicKey, privateKey);
  }

  function subscribe(userId: string, sub: WebPushSubscription, at?: number): { created: boolean } {
    const existing = db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, sub.endpoint))
      .get();
    db.insert(pushSubscriptions)
      .values({
        endpoint: sub.endpoint,
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        createdAt: at ?? clock(),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      })
      .run();
    return { created: !existing };
  }

  function unsubscribe(endpoint: string): void {
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
  }

  async function send(userId: string, payload: NotificationPayload): Promise<number> {
    if (!enabled) return 0;
    const subs = db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .all();
    const body = JSON.stringify(payload);
    let delivered = 0;
    await Promise.all(
      subs.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            body,
          );
          delivered += 1;
        } catch (err) {
          // A dead endpoint (404/410) will never work again — prune it so it stops being retried.
          if (isGone(err)) unsubscribe(row.endpoint);
          else console.error('[push] send failed', err);
        }
      }),
    );
    return delivered;
  }

  function notify(userId: string, payload: NotificationPayload): void {
    // Fire-and-forget: notifications must never throw into or block the caller's request path.
    send(userId, payload).catch(() => {});
  }

  return { enabled, publicKey, subscribe, unsubscribe, send, notify };
}
