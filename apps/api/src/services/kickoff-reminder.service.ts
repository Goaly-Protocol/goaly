import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import type { DB } from '../db/client';
import { matches, predictions } from '../db/schema';
import { fixtureLabel, messages } from './notification-messages';
import type { Notifier } from './notification.service';

/** How far ahead of kickoff the "kicking off soon" nudge fires (1 hour). */
const REMINDER_WINDOW_S = 3600;

export interface KickoffReminderDeps {
  db: DB;
  /** Fire-and-forget push/inbox delivery — the same service the rest of the app uses. */
  notifier: Notifier;
  now?: () => number;
}

export interface KickoffReminder {
  /** One pass: nudge every predictor of a match kicking off within the window (once per match). */
  run(): void;
}

/**
 * Kickoff-soon reminder job. On each `run()` it finds SCHEDULED matches whose kickoff is within the
 * next hour and that haven't been announced yet (`kickoff_notified_at IS NULL`), then nudges every
 * user with an unsettled prediction on them. The per-match `kickoffNotifiedAt` marker is set after,
 * so a match is announced at most once. Per-match work is wrapped so one bad match can't stop the
 * loop; the whole thing is best-effort and never throws into the scheduler.
 */
export function createKickoffReminder(deps: KickoffReminderDeps): KickoffReminder {
  const { db, notifier } = deps;
  const clock = deps.now ?? (() => Date.now());

  function run(): void {
    const nowS = Math.floor(clock() / 1000);

    // SCHEDULED matches kicking off within the next hour that we haven't announced yet.
    const due = db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.status, 'SCHEDULED'),
          gt(matches.kickoff, nowS),
          lte(matches.kickoff, nowS + REMINDER_WINDOW_S),
          isNull(matches.kickoffNotifiedAt),
        ),
      )
      .all();

    for (const match of due) {
      try {
        // Everyone with a live (unsettled) prediction on this match.
        const userRows = db
          .selectDistinct({ userId: predictions.userId })
          .from(predictions)
          .where(and(eq(predictions.matchId, match.id), eq(predictions.settled, false)))
          .all();

        const fixture = fixtureLabel(match.homeTeam, match.awayTeam);
        for (const { userId } of userRows) {
          notifier.notify(userId, messages.kickoffSoon(fixture, match.id));
        }

        // Mark announced so it never fires twice (even with no predictors — nothing to re-check).
        db.update(matches)
          .set({ kickoffNotifiedAt: clock() })
          .where(eq(matches.id, match.id))
          .run();
      } catch (error) {
        const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
        console.warn(`[kickoff] reminder failed for ${match.id}: ${reason}`);
      }
    }
  }

  return { run };
}
