/**
 * Fixed-point money math. All token amounts are represented as `bigint` in base
 * units (USDT0 has 6 decimals). We never use floating point for money.
 */

export const USDT0_DECIMALS = 6;

/** Basis points denominator: 10_000 bps = 100%. */
export const BPS = 10_000n;

/** Seconds in a (365-day) year, used for linear yield accrual. */
export const SECONDS_PER_YEAR = 31_536_000n;

/** Floor-division multiply: `(a * b) / denominator`. Throws on zero denominator. */
export function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('mulDiv: division by zero');
  return (a * b) / denominator;
}

/** Apply a basis-point rate to a value: `value * bps / 10_000` (floored). */
export function applyBps(value: bigint, bps: bigint): bigint {
  return mulDiv(value, bps, BPS);
}

/** Sum a list of bigints. */
export function sum(values: readonly bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}

/** Parse a human decimal string (e.g. "100.5") into base units. */
export function parseUnits(value: string, decimals = USDT0_DECIMALS): bigint {
  const negative = value.startsWith('-');
  const clean = negative ? value.slice(1) : value;
  const [intPart = '0', fracPart = ''] = clean.split('.');
  if (fracPart.length > decimals) {
    throw new Error(`parseUnits: too many decimals for value "${value}" (max ${decimals})`);
  }
  const padded = fracPart.padEnd(decimals, '0');
  const result = BigInt(intPart || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
  return negative ? -result : result;
}

/** Format base units into a human decimal string, trimming trailing zeros. */
export function formatUnits(value: bigint, decimals = USDT0_DECIMALS): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const intPart = abs / base;
  const fracPart = abs % base;
  const fracStr = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  const rendered = fracStr ? `${intPart}.${fracStr}` : `${intPart}`;
  return negative ? `-${rendered}` : rendered;
}
