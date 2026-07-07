// Professional, on-brand copy for every push notification. Kept separate from delivery so the
// wording is easy to tune. `url` is the in-app path opened when the notification is tapped.

export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  /** Replace-key so repeat notifications for the same thing collapse instead of stacking. */
  tag: string;
  /** Category, persisted on the inbox row so the app can group/icon notifications. */
  kind: string;
}

/** Short "Brazil vs Norway" label for copy. */
export function fixtureLabel(homeTeam: string, awayTeam: string): string {
  return `${homeTeam} vs ${awayTeam}`;
}

export const messages = {
  welcome: (): NotificationPayload => ({
    title: 'Welcome to Goaly',
    body: 'Your account is ready. Predict football matches with zero risk to your principal.',
    url: '/play',
    tag: 'welcome',
    kind: 'welcome',
  }),

  predictionPlaced: (fixture: string, matchId: string): NotificationPayload => ({
    title: 'Prediction confirmed',
    body: `Your stake on ${fixture} is locked in. Good luck.`,
    url: '/portfolio',
    tag: `placed:${matchId}`,
    kind: 'placed',
  }),

  won: (fixture: string, prizeUsdt: string, matchId: string): NotificationPayload => ({
    title: 'You won 🎉',
    body: `Your call on ${fixture} paid off — ${prizeUsdt} USDT is ready to claim.`,
    url: '/portfolio',
    tag: `settled:${matchId}`,
    kind: 'won',
  }),

  settledNoWin: (fixture: string, matchId: string): NotificationPayload => ({
    title: 'Match settled',
    body: `${fixture} has finished. This one didn't land — your stake is safe and ready to withdraw.`,
    url: '/portfolio',
    tag: `settled:${matchId}`,
    kind: 'settled',
  }),

  claimed: (amountUsdt: string): NotificationPayload => ({
    title: 'Claim complete',
    body: `${amountUsdt} USDT has landed in your wallet.`,
    url: '/wallet',
    tag: 'claimed',
    kind: 'claimed',
  }),

  kickoffSoon: (fixture: string, matchId: string): NotificationPayload => ({
    title: 'Kicking off soon',
    body: `${fixture} starts in about an hour — the market closes at kickoff.`,
    url: '/play',
    tag: `kickoff:${matchId}`,
    kind: 'kickoff',
  }),
};
