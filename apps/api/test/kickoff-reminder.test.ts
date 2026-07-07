import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/db/client';
import type { DB } from '../src/db/client';
import { matches, predictions } from '../src/db/schema';
import { createKickoffReminder } from '../src/services/kickoff-reminder.service';
import type { NotificationPayload } from '../src/services/notification-messages';

const NOW_MS = 1_000_000; // => nowS = 1000
const NOW_S = Math.floor(NOW_MS / 1000);
const now = () => NOW_MS;

/** Records every notify() call so the test can assert who got nudged. */
function stubNotifier() {
  const calls: { userId: string; payload: NotificationPayload }[] = [];
  return {
    calls,
    notify(userId: string, payload: NotificationPayload) {
      calls.push({ userId, payload });
    },
  };
}

function insertMatch(db: DB, id: string, kickoff: number, status = 'SCHEDULED'): void {
  db.insert(matches)
    .values({
      id,
      sportKey: 'soccer_fifa_world_cup',
      homeTeam: 'Brazil',
      awayTeam: 'Norway',
      kickoff,
      status,
      updatedAt: NOW_MS,
    })
    .run();
}

function insertPrediction(
  db: DB,
  id: string,
  userId: string,
  matchId: string,
  settled: boolean,
): void {
  db.insert(predictions)
    .values({
      id,
      userId,
      matchId,
      market: 'WINNER',
      pick: JSON.stringify({ market: 'WINNER', outcome: 'HOME' }),
      stake: '1000000',
      createdAt: NOW_MS,
      settled,
    })
    .run();
}

describe('createKickoffReminder', () => {
  test('notifies unsettled predictors once, then dedupes on a second run', () => {
    const { db } = createDb(':memory:');
    const notifier = stubNotifier();
    const reminder = createKickoffReminder({ db, notifier, now });

    // Kicks off in 30 minutes → inside the 1h window.
    insertMatch(db, 'soon', NOW_S + 1800);
    insertPrediction(db, 'p1', 'alice', 'soon', false);

    reminder.run();

    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]?.userId).toBe('alice');
    expect(notifier.calls[0]?.payload.kind).toBe('kickoff');

    // Marker set so it fires at most once.
    const marked = db.select().from(matches).where(eq(matches.id, 'soon')).get();
    expect(marked?.kickoffNotifiedAt).toBe(NOW_MS);

    // Second pass: already announced → no further notifications.
    reminder.run();
    expect(notifier.calls).toHaveLength(1);
  });

  test('does not notify a match kicking off in 5 hours (outside the window)', () => {
    const { db } = createDb(':memory:');
    const notifier = stubNotifier();
    const reminder = createKickoffReminder({ db, notifier, now });

    insertMatch(db, 'far', NOW_S + 5 * 3600);
    insertPrediction(db, 'p2', 'bob', 'far', false);

    reminder.run();

    expect(notifier.calls).toHaveLength(0);
    const row = db.select().from(matches).where(eq(matches.id, 'far')).get();
    expect(row?.kickoffNotifiedAt).toBeNull();
  });

  test('does not notify the user of a settled prediction', () => {
    const { db } = createDb(':memory:');
    const notifier = stubNotifier();
    const reminder = createKickoffReminder({ db, notifier, now });

    // In-window match, but its only prediction is already settled → no live predictors.
    insertMatch(db, 'settled', NOW_S + 1800);
    insertPrediction(db, 'p3', 'carol', 'settled', true);

    reminder.run();

    expect(notifier.calls).toHaveLength(0);
  });
});
