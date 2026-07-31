import fc from 'fast-check';
import { applyDecimal, formatDate } from './format';

describe('applyDecimal', () => {
  it('formats to a fixed number of places', () => {
    expect(applyDecimal('0.1', 2)).toBe('0.10');
    expect(applyDecimal(1000, 2)).toBe('1000.00');
    expect(applyDecimal('18.5', 2)).toBe('18.50');
  });

  it('rounds half-up on exact decimals (no float error)', () => {
    expect(applyDecimal('18.005', 2)).toBe('18.01'); // would be 18.00 with float toFixed
    expect(applyDecimal('2.5', 0)).toBe('3');
    expect(applyDecimal('-2.5', 0)).toBe('-3'); // half-up away from zero
  });

  it('normalizes negative zero to zero (no "-0" amounts)', () => {
    expect(applyDecimal('-0.001', 2)).toBe('0.00');
    expect(applyDecimal('-0.3', 0)).toBe('0');
    expect(applyDecimal(-0, 2)).toBe('0.00');
  });

  it('throws on invalid input — never silently coerces', () => {
    expect(() => applyDecimal('abc', 2)).toThrow();
    expect(() => applyDecimal(Infinity, 2)).toThrow();
    expect(() => applyDecimal('1', 7)).toThrow();
    expect(() => applyDecimal('1', -1)).toThrow();
    expect(() => applyDecimal('1', 1.5)).toThrow();
  });

  it('property: output always has exactly `places` fractional digits', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e7, max: 1e7 }),
        fc.integer({ min: 0, max: 6 }),
        (value, places) => {
          const out = applyDecimal(value, places);
          const re = places > 0 ? new RegExp(`^-?\\d+\\.\\d{${places}}$`) : /^-?\d+$/;
          expect(out).toMatch(re);
        },
      ),
    );
  });

  it('property: idempotent — re-formatting a formatted value is a no-op', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e7, max: 1e7 }),
        fc.integer({ min: 0, max: 6 }),
        (value, places) => {
          const once = applyDecimal(value, places);
          expect(applyDecimal(once, places)).toBe(once);
        },
      ),
    );
  });
});

describe('formatDate', () => {
  it('formats in UTC for each supported format', () => {
    expect(formatDate('2026-07-31T09:05:07Z', 'CCYYMMDD')).toBe('20260731');
    expect(formatDate('2026-07-31T09:05:07Z', 'YYMMDD')).toBe('260731');
    expect(formatDate('2026-07-31T09:05:07Z', 'HHMM')).toBe('0905');
    expect(formatDate('2026-07-31T09:05:07Z', 'HHMMSS')).toBe('090507');
  });

  it('treats a date-only string as UTC', () => {
    expect(formatDate('2026-07-31', 'CCYYMMDD')).toBe('20260731');
  });

  it('throws on an invalid date (string or Invalid Date object)', () => {
    expect(() => formatDate('not-a-date', 'CCYYMMDD')).toThrow();
    expect(() => formatDate(new Date(NaN), 'CCYYMMDD')).toThrow();
  });

  it('property: each format yields the right number of numeric digits', () => {
    const lengths: Record<string, number> = { CCYYMMDD: 8, YYMMDD: 6, HHMM: 4, HHMMSS: 6 };
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('1970-01-01T00:00:00Z'),
          max: new Date('2099-12-31T23:59:59Z'),
          noInvalidDate: true, // formatDate correctly THROWS on Invalid Date; this property is about valid dates
        }),
        fc.constantFrom('CCYYMMDD', 'YYMMDD', 'HHMM', 'HHMMSS'),
        (d, format) => {
          const out = formatDate(d, format as 'CCYYMMDD');
          expect(out).toMatch(/^\d+$/);
          expect(out.length).toBe(lengths[format]);
        },
      ),
    );
  });
});
