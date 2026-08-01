import { ConformanceValidator } from './conformance-validator';
import { HOUSE_850 } from './specs/house850';
import { EmitService } from '../mapping/engine/emit.service';
import { SAMPLE_DOC, SAMPLE_MAP } from '../testing/fixtures';
import { RawSegment } from '../x12/x12.service';

describe('ConformanceValidator (house-format 850)', () => {
  const validator = new ConformanceValidator();
  const emit = new EmitService();
  const body = (): RawSegment[] => emit.emit(SAMPLE_DOC, SAMPLE_MAP); // fresh copy each test

  it('accepts a conformant emitted 850', () => {
    const r = validator.validate(body(), HOUSE_850);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('flags a missing mandatory segment (CTT)', () => {
    const segs = body().filter((s) => s.tag !== 'CTT');
    const r = validator.validate(segs, HOUSE_850);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/missing mandatory segment CTT/);
  });

  it('flags a missing required element (BEG PO number)', () => {
    const segs = body();
    segs.find((s) => s.tag === 'BEG')!.elements[2] = ''; // BEG03
    const r = validator.validate(segs, HOUSE_850);
    expect(r.errors.join(' ')).toMatch(/BEG03: required element missing/);
  });

  it('flags a bad code value (PO type)', () => {
    const segs = body();
    segs.find((s) => s.tag === 'BEG')!.elements[1] = 'ZZ'; // BEG02 not in code list
    const r = validator.validate(segs, HOUSE_850);
    expect(r.errors.join(' ')).toMatch(/BEG02: code "ZZ" not allowed/);
  });

  it('flags a non-numeric amount (PO1 quantity)', () => {
    const segs = body();
    segs.find((s) => s.tag === 'PO1')!.elements[1] = 'abc'; // PO102 should be numeric
    const r = validator.validate(segs, HOUSE_850);
    expect(r.errors.join(' ')).toMatch(/PO102: not numeric/);
  });

  it('flags an over-length element (PO number > 22)', () => {
    const segs = body();
    segs.find((s) => s.tag === 'BEG')!.elements[2] = 'X'.repeat(30);
    const r = validator.validate(segs, HOUSE_850);
    expect(r.errors.join(' ')).toMatch(/BEG03: too long/);
  });

  it('flags an unexpected segment', () => {
    const segs = [...body(), { tag: 'ZZ', elements: ['x'] }];
    const r = validator.validate(segs, HOUSE_850);
    expect(r.errors.join(' ')).toMatch(/unexpected segment ZZ/);
  });

  it('flags cardinality violation (two CTT)', () => {
    const segs = [...body(), { tag: 'CTT', elements: ['2'] }];
    const r = validator.validate(segs, HOUSE_850);
    expect(r.errors.join(' ')).toMatch(/CTT occurs 2× \(max 1\)/);
  });

  describe('structured issues (for 997 AK3/AK4)', () => {
    it('element issue carries tag, segment position, element position + AK403 code', () => {
      const segs = body();
      segs.find((s) => s.tag === 'BEG')!.elements[1] = 'ZZ'; // BEG02 bad code
      const begPos = segs.findIndex((s) => s.tag === 'BEG') + 1;
      const r = validator.validate(segs, HOUSE_850);
      const issue = r.issues.find((i) => i.segmentTag === 'BEG' && i.elementPosition === 2);
      expect(issue).toMatchObject({ level: 'element', segmentPosition: begPos, elementPosition: 2, errorCode: '7', badValue: 'ZZ' });
    });

    it('non-numeric → AK403 code 6 (invalid character); over-length → 4; too-short → 5', () => {
      const segs = body();
      segs.find((s) => s.tag === 'PO1')!.elements[1] = 'abc';
      const r = validator.validate(segs, HOUSE_850);
      expect(r.issues.find((i) => i.segmentTag === 'PO1' && i.elementPosition === 2)?.errorCode).toBe('6');
    });

    it('unexpected segment → segment-level AK304 code 2 at its received position', () => {
      const segs = [...body(), { tag: 'ZZ', elements: ['x'] }];
      const r = validator.validate(segs, HOUSE_850);
      expect(r.issues.find((i) => i.segmentTag === 'ZZ')).toMatchObject({ level: 'segment', errorCode: '2', segmentPosition: segs.length });
    });

    it('missing mandatory segment → AK304 code 3 with position 0 (absent)', () => {
      const segs = body().filter((s) => s.tag !== 'CTT');
      const r = validator.validate(segs, HOUSE_850);
      expect(r.issues.find((i) => i.segmentTag === 'CTT')).toMatchObject({ level: 'segment', errorCode: '3', segmentPosition: 0 });
    });
  });
});
