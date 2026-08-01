import { ElementFormat, MapElement } from '../dsl/map.types';

/**
 * Ingest coercion — the inverse of `format.ts`. X12 is untyped on the wire (everything is a
 * string), so ingest coerces values back into typed canonical form, driven by the SAME element
 * modifiers emit used: `format` → date/time, `decimal` → number. Unmarked fields stay strings
 * (they are strings: ids, codes, line numbers, UOMs, roles).
 *
 * Fails loudly on malformed input — never silently store a bad number or date (financial safety).
 * (Future: collect per-field coercion errors into inbound errors rather than aborting the parse.)
 */

/** X12 numeric string → number. Throws on empty/non-numeric (Number('') is 0 — a silent-money bug). */
export function parseDecimal(value: string): number {
  if (value.trim() === '') throw new Error('coerce: empty numeric value');
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`coerce: not a numeric value: "${value}"`);
  return n;
}

/** X12 date/time string (as produced by formatDate) → canonical "YYYY-MM-DD" / "HH:MM[:SS]". */
export function parseX12Date(value: string, format: ElementFormat): string {
  if (!/^\d+$/.test(value)) throw new Error(`coerce: non-numeric ${format} value: "${value}"`);
  const need = (len: number): void => {
    if (value.length !== len) {
      throw new Error(`coerce: ${format} expects ${len} digits, got "${value}" (${value.length})`);
    }
  };
  switch (format) {
    case 'CCYYMMDD':
      need(8);
      return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    case 'YYMMDD': {
      need(6);
      const yy = Number(value.slice(0, 2));
      const year = yy >= 70 ? 1900 + yy : 2000 + yy; // standard X12 century pivot
      return `${year}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
    }
    case 'HHMM':
      need(4);
      return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
    case 'HHMMSS':
      need(6);
      return `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}`;
    default:
      return value;
  }
}

/** Coerce a wire value into its typed canonical form, per the element's modifiers. */
export function coerceElement(value: string, el: MapElement): string | number {
  if (el.format) return parseX12Date(value, el.format);
  if (el.decimal !== undefined) return parseDecimal(value);
  return value;
}
