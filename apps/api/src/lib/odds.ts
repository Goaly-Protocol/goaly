/** Decimal odds per outcome (e.g. 1.30 = favorite). */
export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
}

interface Bookmaker {
  markets?: Array<{ key: string; outcomes?: Array<{ name: string; price: number }> }>;
}

/**
 * Parse The Odds API `bookmakers` JSON (as stored in `oddsCache.data`) into average h2h decimal
 * odds for a match. Returns null when no usable h2h prices are present.
 */
export function parseH2hOdds(
  bookmakersJson: string,
  homeTeam: string,
  awayTeam: string,
): MatchOdds | null {
  let bookmakers: Bookmaker[];
  try {
    bookmakers = JSON.parse(bookmakersJson) as Bookmaker[];
  } catch {
    return null;
  }
  if (!Array.isArray(bookmakers)) return null;

  let home = 0;
  let draw = 0;
  let away = 0;
  let count = 0;
  for (const bookmaker of bookmakers) {
    const h2h = bookmaker.markets?.find((m) => m.key === 'h2h');
    if (!h2h?.outcomes) continue;
    const h = h2h.outcomes.find((o) => o.name === homeTeam)?.price;
    const a = h2h.outcomes.find((o) => o.name === awayTeam)?.price;
    const d = h2h.outcomes.find((o) => o.name === 'Draw')?.price;
    if (h && a && d) {
      home += h;
      away += a;
      draw += d;
      count += 1;
    }
  }
  if (count === 0) return null;
  return { home: home / count, draw: draw / count, away: away / count };
}

/** Winning-outcome decimal odds × 10_000 (for the on-chain boost). 10_000 (1.00) = no boost. */
export function winningOddsBps(odds: MatchOdds | null, result: 'HOME' | 'DRAW' | 'AWAY'): bigint {
  if (!odds) return 10_000n;
  const decimal = result === 'HOME' ? odds.home : result === 'AWAY' ? odds.away : odds.draw;
  if (!Number.isFinite(decimal) || decimal <= 1) return 10_000n;
  return BigInt(Math.round(decimal * 10_000));
}
