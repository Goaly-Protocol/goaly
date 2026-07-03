/**
 * The odds feed occasionally emits aggregate/placeholder rows that aren't real fixtures — e.g.
 * "Home Team - Friday - 3 Matches" vs "Away Team - Friday - 3 Matches", or bracketed multi-game
 * bundles. Real fixtures have short, plain team names, so we drop anything that looks aggregate.
 */
const PLACEHOLDER = /home team|away team|\bmatches\b|\ball games\b|[[\]]/i;

/** True when both sides look like real team names (not feed placeholders). */
export function isRealMatch(homeTeam: string, awayTeam: string): boolean {
  for (const name of [homeTeam, awayTeam]) {
    if (!name || name.length > 42) return false;
    if (PLACEHOLDER.test(name)) return false;
  }
  return true;
}
