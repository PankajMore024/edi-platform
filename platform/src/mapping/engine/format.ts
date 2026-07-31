import Decimal from 'decimal.js';
import { ElementFormat } from '../dsl/map.types';

/**
 * Financial-correctness primitives — the money-critical value transforms the map DSL applies
 * (`decimal` and `format` element modifiers). These are pure, deterministic, and exhaustively
 * tested because a rounding or timezone slip here is a real financial error.
 *
 * Rules (see docs/design/quality-and-process.md):
 *  - NEVER float math for money → decimal.js, explicit ROUND_HALF_UP.
 *  - Dates are formatted in UTC → no local-time ambiguity.
 *  - Invalid input throws — never silently coerce.
 */

const pad = (n: number, width: number): string => Math.abs(n).toString().padStart(width, '0');

/**
 * Format a numeric value to a fixed number of decimal places (X12 amount fields).
 * @returns a plain decimal string with exactly `places` fractional digits (none if 0).
 */
export function applyDecimal(value: string | number, places: number): string {
  if (!Number.isInteger(places) || places < 0 || places > 6) {
    throw new Error(`applyDecimal: invalid places "${places}" (expected integer 0..6)`);
  }
  let d: Decimal;
  try {
    d = new Decimal(value);
  } catch {
    throw new Error(`applyDecimal: not a number: "${value}"`);
  }
  if (!d.isFinite()) {
    throw new Error(`applyDecimal: non-finite value: "${value}"`);
  }
  const out = d.toFixed(places, Decimal.ROUND_HALF_UP);
  // Normalize negative zero ("-0", "-0.00") — a signed-zero amount is nonsensical on an EDI doc.
  return /^-0(\.0+)?$/.test(out) ? out.slice(1) : out;
}

/**
 * Format a date/time value into an X12 date/time string, in UTC.
 * @param value ISO-8601 string or Date.
 */
export function formatDate(value: string | Date, format: ElementFormat): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`formatDate: invalid date: "${String(value)}"`);
  }
  const yyyy = pad(d.getUTCFullYear(), 4);
  const yy = pad(d.getUTCFullYear() % 100, 2);
  const mm = pad(d.getUTCMonth() + 1, 2);
  const dd = pad(d.getUTCDate(), 2);
  const hh = pad(d.getUTCHours(), 2);
  const mi = pad(d.getUTCMinutes(), 2);
  const ss = pad(d.getUTCSeconds(), 2);

  switch (format) {
    case 'CCYYMMDD':
      return `${yyyy}${mm}${dd}`;
    case 'YYMMDD':
      return `${yy}${mm}${dd}`;
    case 'HHMM':
      return `${hh}${mi}`;
    case 'HHMMSS':
      return `${hh}${mi}${ss}`;
    default:
      throw new Error(`formatDate: unknown format: "${format as string}"`);
  }
}
