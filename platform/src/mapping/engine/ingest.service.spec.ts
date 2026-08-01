import { IngestService } from './ingest.service';
import { EmitService } from './emit.service';
import { X12Service } from '../../x12/x12.service';
import { SAMPLE_MAP, SAMPLE_DOC } from '../../testing/fixtures';

describe('IngestService', () => {
  const ingest = new IngestService();
  const emit = new EmitService();
  const x12 = new X12Service();

  it('parses the sample 850 into the canonical shape', () => {
    const segs = emit.emit(SAMPLE_DOC, SAMPLE_MAP);
    const doc = ingest.ingest(segs, SAMPLE_MAP) as any;

    expect(doc.meta).toEqual({ docType: '850', direction: 'inbound', partner: 'acme', tenantId: '' });
    expect(doc.poNumber).toBe('4500');
    expect(doc.poDate).toBe('2026-07-31'); // coerced from CCYYMMDD back to ISO
    expect(doc.parties).toEqual([
      { role: 'ST', address: { name: 'ACME WAREHOUSE' } },
      { role: 'BT', address: { name: 'ACME HQ' } },
    ]);
    expect(doc.lineItems).toEqual([
      { lineNumber: '1', quantity: { value: 10, uom: 'EA' }, unitPrice: { amount: 18.5 }, ids: [{ value: '012345678905' }] },
      { lineNumber: '2', quantity: { value: 5, uom: 'EA' }, unitPrice: { amount: 44 }, ids: [{ value: '099887766554' }] },
    ]);
    expect(doc.inbound.unmapped).toEqual([]);
  });

  it('captures unclaimed segments in inbound.unmapped (never drops data)', () => {
    const segs = [...emit.emit(SAMPLE_DOC, SAMPLE_MAP), { tag: 'REF', elements: ['XY', 'note'] }];
    const doc = ingest.ingest(segs, SAMPLE_MAP) as any;
    expect(doc.inbound.unmapped).toEqual([{ tag: 'REF', elements: ['XY', 'note'] }]);
  });

  it('does not infinite-loop when a looped leading segment fails its `match` (regression)', () => {
    const map: any = {
      partner: 'acme',
      docType: '850',
      direction: 'inbound',
      structure: [
        {
          loop: 'N1',
          over: 'parties',
          segments: [{ segment: 'N1', match: { pos: 1, eq: 'ST' }, elements: [{ pos: 2, path: 'name' }] }],
        },
      ],
    };
    // N1 present (so the while-tag matches) but its match value is 'XX', not 'ST'.
    const segs = [{ tag: 'N1', elements: ['XX', 'NOPE'] }];
    const doc = ingest.ingest(segs, map) as any; // must terminate, not hang
    expect(doc.parties).toBeUndefined();
    expect(doc.inbound.unmapped).toEqual([{ tag: 'N1', elements: ['XX', 'NOPE'] }]);
  });

  it('round-trip: ingest then re-emit reproduces the original segments', () => {
    // Ingest now yields TYPED canonical (ISO dates, numbers), so re-emitting through the SAME
    // map reproduces the original bytes exactly — no format/decimal stripping needed.
    const original = emit.emit(SAMPLE_DOC, SAMPLE_MAP);
    const doc = ingest.ingest(original, SAMPLE_MAP);
    expect(emit.emit(doc, SAMPLE_MAP)).toEqual(original);
  });
});
