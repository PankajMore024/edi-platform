import fc from 'fast-check';
import { parseDecimal, parseX12Date, coerceElement } from './coerce';
import { formatDate, applyDecimal } from './format';

describe('parseDecimal', () => {
  it('parses numeric strings to numbers', () => {
    expect(parseDecimal('18.50')).toBe(18.5);
    expect(parseDecimal('405.00')).toBe(405);
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal('-3.25')).toBe(-3.25);
  });
  it('throws on non-numeric (never silently coerce money)', () => {
    expect(() => parseDecimal('abc')).toThrow();
    expect(() => parseDecimal('')).toThrow();
  });
});

describe('parseX12Date', () => {
  it('parses each format to canonical form', () => {
    expect(parseX12Date('20260731', 'CCYYMMDD')).toBe('2026-07-31');
    expect(parseX12Date('260731', 'YYMMDD')).toBe('2026-07-31');
    expect(parseX12Date('850731', 'YYMMDD')).toBe('1985-07-31'); // century pivot at 70
    expect(parseX12Date('0905', 'HHMM')).toBe('09:05');
    expect(parseX12Date('090507', 'HHMMSS')).toBe('09:05:07');
  });
  it('throws on wrong length or non-digits', () => {
    expect(() => parseX12Date('2026073', 'CCYYMMDD')).toThrow();
    expect(() => parseX12Date('20x5', 'HHMM')).toThrow();
  });
});

describe('coerceElement', () => {
  it('coerces per element modifier; leaves plain fields as strings', () => {
    expect(coerceElement('20260731', { pos: 1, path: 'd', format: 'CCYYMMDD' })).toBe('2026-07-31');
    expect(coerceElement('18.50', { pos: 1, path: 'a', decimal: 2 })).toBe(18.5);
    expect(coerceElement('EA', { pos: 1, path: 'u' })).toBe('EA');
  });
});

describe('emit/ingest are inverse on the wire', () => {
  it('date: formatDate ∘ parseX12Date = identity', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('1970-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true }),
        (d) => {
          const wire = formatDate(d, 'CCYYMMDD');
          expect(formatDate(parseX12Date(wire, 'CCYYMMDD'), 'CCYYMMDD')).toBe(wire);
        },
      ),
    );
  });
  it('decimal: applyDecimal ∘ parseDecimal = identity', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }),
        fc.integer({ min: 0, max: 6 }),
        (v, p) => {
          const wire = applyDecimal(v, p);
          expect(applyDecimal(parseDecimal(wire), p)).toBe(wire);
        },
      ),
    );
  });
});
