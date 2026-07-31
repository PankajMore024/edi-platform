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
    expect(doc.poDate).toBe('20260731'); // wire form (untyped); coercion is a later step
    expect(doc.parties).toEqual([
      { role: 'ST', address: { name: 'ACME WAREHOUSE' } },
      { role: 'BT', address: { name: 'ACME HQ' } },
    ]);
    expect(doc.lineItems).toEqual([
      { lineNumber: '1', quantity: { value: '10', uom: 'EA' }, unitPrice: { amount: '18.50' }, ids: [{ value: '012345678905' }] },
      { lineNumber: '2', quantity: { value: '5', uom: 'EA' }, unitPrice: { amount: '44.00' }, ids: [{ value: '099887766554' }] },
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

  it('round-trip: re-emitting the ingested doc reproduces the same segments', () => {
    // Ingest yields wire-form values; re-emitting them (no date/decimal re-transform needed
    // because they are already formatted) must reproduce the original segments.
    const original = emit.emit(SAMPLE_DOC, SAMPLE_MAP);
    const doc = ingest.ingest(original, SAMPLE_MAP);

    // A wire-form map: same structure, but read the already-formatted values straight through.
    const wireMap = JSON.parse(JSON.stringify(SAMPLE_MAP));
    for (const node of wireMap.structure) {
      const segs = node.segments ?? [node];
      for (const s of segs) for (const el of s.elements) {
        delete el.format; // poDate already 'CCYYMMDD'
        delete el.decimal; // amount already scaled
      }
    }
    expect(emit.emit(doc, wireMap)).toEqual(original);
  });
});
