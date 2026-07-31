import fc from 'fast-check';
import { RawSegment, X12Service } from './x12.service';

describe('X12Service', () => {
  const svc = new X12Service();

  it('serializes segments to X12', () => {
    const segs: RawSegment[] = [
      { tag: 'BEG', elements: ['00', 'SA', '4500', '', '20260731'] },
      { tag: 'CTT', elements: ['2'] },
    ];
    expect(svc.serialize(segs)).toBe('BEG*00*SA*4500**20260731~\nCTT*2~\n');
  });

  it('parses X12 back to segments, ignoring newlines', () => {
    expect(svc.parse('BEG*00*SA*4500**20260731~\nCTT*2~\n')).toEqual([
      { tag: 'BEG', elements: ['00', 'SA', '4500', '', '20260731'] },
      { tag: 'CTT', elements: ['2'] },
    ]);
  });

  it('property: parse ∘ serialize is the exact identity on segments', () => {
    const token = fc
      .string({ minLength: 0, maxLength: 6 })
      .filter((s) => !/[*~:\r\n]/.test(s)); // element values can't contain delimiters or newlines
    const tag = fc
      .string({ minLength: 2, maxLength: 3 })
      .filter((s) => /^[A-Z][A-Z0-9]{1,2}$/.test(s));
    const segment = fc.record({ tag, elements: fc.array(token, { maxLength: 8 }) });

    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 20 }), (segs) => {
        expect(svc.parse(svc.serialize(segs))).toEqual(segs);
      }),
    );
  });
});
