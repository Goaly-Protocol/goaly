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

/** A match's frozen closing odds (×10_000 bps, null until frozen at kickoff). */
export interface ClosingOdds {
  closingHomeBps: number | null;
  closingDrawBps: number | null;
  closingAwayBps: number | null;
}

/** Frozen closing odds as decimals, or null when not yet frozen. */
export function frozenOdds(m: ClosingOdds): MatchOdds | null {
  if (m.closingHomeBps == null || m.closingDrawBps == null || m.closingAwayBps == null) return null;
  return {
    home: m.closingHomeBps / 10_000,
    draw: m.closingDrawBps / 10_000,
    away: m.closingAwayBps / 10_000,
  };
}

/** Frozen winning-outcome odds in bps, or null when not frozen (caller falls back to live odds). */
export function closingWinningOddsBps(
  m: ClosingOdds,
  result: 'HOME' | 'DRAW' | 'AWAY',
): bigint | null {
  const bps =
    result === 'HOME' ? m.closingHomeBps : result === 'AWAY' ? m.closingAwayBps : m.closingDrawBps;
  if (bps == null) return null;
  return bps > 10_000 ? BigInt(bps) : 10_000n;
}
