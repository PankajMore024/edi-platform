import { EmitService } from './emit.service';
import { IngestService } from './ingest.service';
import { X12Service } from '../../x12/x12.service';
import { assertGolden } from '../../testing/golden';
import {
  SAMPLE_MAP,
  SAMPLE_DOC,
  SAMPLE_810_MAP,
  SAMPLE_810_DOC,
} from '../../testing/fixtures';

/**
 * Proof the engine is DOC-TYPE-AGNOSTIC: the identical EmitService / IngestService handle an 850
 * (BEG/PO1/CTT) and an 810 (BIG/IT1/TDS) — two different doc types, different segments — with no
 * engine change. A new doc type is a new canonical shape + a new map, nothing more.
 */
describe('engine is doc-type-agnostic (one engine, many doc types)', () => {
  const emit = new EmitService();
  const ingest = new IngestService();
  const x12 = new X12Service();

  it('emits an 810 invoice (BIG/IT1/TDS) to its golden — same EmitService as the 850', () => {
    const out = x12.serialize(emit.emit(SAMPLE_810_DOC, SAMPLE_810_MAP));
    assertGolden('acme/810/outbound/4010.edi', out);
  });

  it('round-trips the 810 back to canonical (financial fields intact)', () => {
    const doc = ingest.ingest(emit.emit(SAMPLE_810_DOC, SAMPLE_810_MAP), SAMPLE_810_MAP) as any;
    expect(doc.invoiceNumber).toBe('INV-77');
    expect(doc.poNumber).toBe('4500');
    expect(doc.totalAmount).toBe('405.00'); // wire form; coercion is the later step
    expect(doc.lineItems).toHaveLength(2);
    expect(doc.lineItems[0].unitPrice.amount).toBe('18.50');
    expect(doc.inbound.unmapped).toEqual([]);
  });

  it('the very same service instances produce both doc types', () => {
    const eightFifty = x12.serialize(emit.emit(SAMPLE_DOC, SAMPLE_MAP));
    const eightTen = x12.serialize(emit.emit(SAMPLE_810_DOC, SAMPLE_810_MAP));
    expect(eightFifty).toContain('BEG*'); // 850 segments
    expect(eightTen).toContain('BIG*'); // 810 segments
    expect(eightTen).toContain('TDS*405.00~'); // 810-specific total, decimal-scaled
  });
});
