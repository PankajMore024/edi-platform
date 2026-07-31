import { EmitService } from './emit.service';
import { IngestService } from './ingest.service';
import { X12Service } from '../../x12/x12.service';
import { assertGolden } from '../../testing/golden';
import {
  SAMPLE_855_MAP,
  SAMPLE_855_DOC,
  SAMPLE_856_MAP,
  SAMPLE_856_DOC,
  SAMPLE_997_MAP,
  SAMPLE_997_DOC,
} from '../../testing/fixtures';

/**
 * The full sell-side outbound set (receive 850 → return 855 / 856 / 810 / 997), all through the
 * one engine. 810 is covered in doc-types.spec; here: 855 (multi-segment line loop), 856 (HL
 * hierarchy), 997 (functional ack).
 */
describe('sell-side outbound doc types', () => {
  const emit = new EmitService();
  const ingest = new IngestService();
  const x12 = new X12Service();

  describe('855 PO Acknowledgment (multi-segment line loop: PO1 + ACK)', () => {
    it('emits to its golden', () => {
      assertGolden('acme/855/outbound/4010.edi', x12.serialize(emit.emit(SAMPLE_855_DOC, SAMPLE_855_MAP)));
    });
    it('round-trips, preserving per-line ack status', () => {
      const doc = ingest.ingest(emit.emit(SAMPLE_855_DOC, SAMPLE_855_MAP), SAMPLE_855_MAP) as any;
      expect(doc.poNumber).toBe('4500');
      expect(doc.lineItems).toHaveLength(2);
      expect(doc.lineItems[0].ackStatus).toBe('IA');
      expect(doc.lineItems[1].ackStatus).toBe('IA');
      expect(doc.inbound.unmapped).toEqual([]);
    });
  });

  describe('856 ASN (HL hierarchy: shipment → order → item)', () => {
    it('emits to its golden with correct HL numbering', () => {
      assertGolden('acme/856/outbound/4010.edi', x12.serialize(emit.emit(SAMPLE_856_DOC, SAMPLE_856_MAP)));
    });
    it('assigns sequential HL ids and correct parent pointers (depth-first)', () => {
      const hls = emit.emit(SAMPLE_856_DOC, SAMPLE_856_MAP).filter((s) => s.tag === 'HL');
      // shipment(1,-)  order(2,1)  item(3,2)  item(4,2)
      expect(hls.map((s) => s.elements)).toEqual([
        ['1', '', 'S'],
        ['2', '1', 'O'],
        ['3', '2', 'I'],
        ['4', '2', 'I'],
      ]);
    });
  });

  describe('997 Functional Acknowledgment (AK1 / AK9)', () => {
    it('emits to its golden', () => {
      assertGolden('acme/997/outbound/4010.edi', x12.serialize(emit.emit(SAMPLE_997_DOC, SAMPLE_997_MAP)));
    });
  });
});
