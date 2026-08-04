import { X12Service } from '../x12/x12.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EmitService } from '../mapping/engine/emit.service';
import { ConformanceValidator } from './conformance-validator';
import { HOUSE_846 } from './specs/house846';
import { SAMPLE_846_MAP } from '../testing/fixtures';

/**
 * Inbound validation for the 846 Inventory Advice — a STANDALONE feed (no anchor doc, so no cross-doc
 * correlation): conformance + ingest + round-trip only.
 */
const PARTNER_846 = [
  'BIA*00*DD*INV-0804*20260804~',
  'LIN*1*UP*012345678905~',
  'QTY*33*120~',
  'LIN*2*UP*099887766554~',
  'QTY*33*45~',
].join('\n');

describe('inbound 846 validation', () => {
  const x12 = new X12Service();
  const ingest = new IngestService();
  const emit = new EmitService();
  const validator = new ConformanceValidator();

  it('a well-formed partner 846 conforms to the house 846 spec', () => {
    const r = validator.validate(x12.parse(PARTNER_846), HOUSE_846);
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('ingests the 846 into the canonical inventory shape', () => {
    const doc = ingest.ingest(x12.parse(PARTNER_846), SAMPLE_846_MAP) as any;
    expect(doc.reportType).toBe('DD');
    expect(doc.referenceId).toBe('INV-0804');
    expect(doc.items).toEqual([
      { lineNumber: '1', quantity: { value: 120 }, ids: [{ value: '012345678905' }] },
      { lineNumber: '2', quantity: { value: 45 }, ids: [{ value: '099887766554' }] },
    ]);
    expect(doc.inbound.unmapped).toEqual([]);
  });

  it('round-trips: ingest then re-emit reproduces the wire', () => {
    const segs = x12.parse(PARTNER_846);
    expect(emit.emit(ingest.ingest(segs, SAMPLE_846_MAP), SAMPLE_846_MAP)).toEqual(segs);
  });

  it('flags a missing quantity qualifier (mandatory QTY01)', () => {
    const bad = ['BIA*00*DD*INV-0804*20260804~', 'LIN*1*UP*012345678905~', 'QTY**120~'].join('\n');
    const r = validator.validate(x12.parse(bad), HOUSE_846);
    expect(r.valid).toBe(false);
    expect(r.issues).toContainEqual(expect.objectContaining({ segmentTag: 'QTY', elementPosition: 1, errorCode: '1' }));
  });
});
