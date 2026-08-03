import { X12Service } from '../x12/x12.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EmitService } from '../mapping/engine/emit.service';
import { ConformanceValidator } from './conformance-validator';
import { HOUSE_855 } from './specs/house855';
import { correlateAckToOrder } from './correlation';
import { SAMPLE_855_MAP, SAMPLE_DOC } from '../testing/fixtures';

/**
 * Inbound validation for the first response doc type (855) — the long pole behind the certification
 * board. Proves we can take a partner's real 855 wire file and (1) validate it against our house spec,
 * (2) ingest it to canonical, (3) round-trip it, and (4) confirm it corresponds to the 850 we sent.
 */

// A partner's returned 855 as raw X12 (a transaction-set body, no envelope) — the bytes they'd drop.
const PARTNER_855 = [
  'BAK*00*AC*4500*20260731~',
  'N1*ST*ACME WAREHOUSE~',
  'PO1*1*10*EA*18.50**UP*012345678905~',
  'ACK*IA*10*EA~',
  'PO1*2*5*EA*44.00**UP*099887766554~',
  'ACK*IA*5*EA~',
  'CTT*2~',
].join('\n');

describe('inbound 855 validation', () => {
  const x12 = new X12Service();
  const ingest = new IngestService();
  const emit = new EmitService();
  const validator = new ConformanceValidator();

  it('a well-formed partner 855 conforms to the house 855 spec', () => {
    const segs = x12.parse(PARTNER_855);
    const r = validator.validate(segs, HOUSE_855);
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('ingests the 855 wire into the canonical acknowledgment shape', () => {
    const doc = ingest.ingest(x12.parse(PARTNER_855), SAMPLE_855_MAP) as any;
    expect(doc.meta).toEqual({ docType: '855', direction: 'inbound', partner: 'acme', tenantId: '' });
    expect(doc.poNumber).toBe('4500');
    expect(doc.ackType).toBe('AC');
    expect(doc.parties).toEqual([{ role: 'ST', address: { name: 'ACME WAREHOUSE' } }]);
    expect(doc.lineItems).toEqual([
      { lineNumber: '1', quantity: { value: 10, uom: 'EA' }, unitPrice: { amount: 18.5 }, ids: [{ value: '012345678905' }], ackStatus: 'IA' },
      { lineNumber: '2', quantity: { value: 5, uom: 'EA' }, unitPrice: { amount: 44 }, ids: [{ value: '099887766554' }], ackStatus: 'IA' },
    ]);
    expect(doc.inbound.unmapped).toEqual([]);
  });

  it('round-trips: ingest then re-emit reproduces the original wire segments', () => {
    const segs = x12.parse(PARTNER_855);
    expect(emit.emit(ingest.ingest(segs, SAMPLE_855_MAP), SAMPLE_855_MAP)).toEqual(segs);
  });

  it('flags conformance defects: a missing PO number and an invalid ACK status code', () => {
    const bad = ['BAK*00*AC**20260731~', 'PO1*1*10*EA*18.50**UP*012345678905~', 'ACK*ZZ*10*EA~', 'CTT*1~'].join('\n');
    const r = validator.validate(x12.parse(bad), HOUSE_855);
    expect(r.valid).toBe(false);
    // BAK03 (Purchase Order Number) mandatory but empty → element error code '1'.
    expect(r.issues).toContainEqual(expect.objectContaining({ segmentTag: 'BAK', elementPosition: 3, errorCode: '1' }));
    // ACK01 'ZZ' not in the line-item status code list → element error code '7'.
    expect(r.issues).toContainEqual(expect.objectContaining({ segmentTag: 'ACK', elementPosition: 1, errorCode: '7', badValue: 'ZZ' }));
  });

  describe('cross-doc correlation to the originating 850', () => {
    const ack = ingest.ingest(x12.parse(PARTNER_855), SAMPLE_855_MAP) as any;

    it('correlates when PO and lines match the order', () => {
      const r = correlateAckToOrder(ack, SAMPLE_DOC);
      expect(r.correlated).toBe(true);
      expect(r.issues).toEqual([]);
    });

    it('reports a PO mismatch (and nothing else) when the ack answers a different order', () => {
      const r = correlateAckToOrder(ack, { ...SAMPLE_DOC, poNumber: '9999' });
      expect(r.correlated).toBe(false);
      expect(r.issues).toHaveLength(1);
      expect(r.issues[0].kind).toBe('po-mismatch');
    });

    it('flags a line acknowledged that was never ordered', () => {
      const withExtra = { poNumber: '4500', lineItems: [...ack.lineItems, { ids: [{ value: 'NEVER-ORDERED' }], quantity: { value: 1 } }] };
      const r = correlateAckToOrder(withExtra, SAMPLE_DOC);
      expect(r.correlated).toBe(false);
      expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'unknown-line', ref: 'NEVER-ORDERED' }));
    });

    it('flags an acknowledged quantity that exceeds what was ordered', () => {
      const over = { poNumber: 'X', lineItems: [{ ids: [{ value: 'A' }], quantity: { value: 20 } }] };
      const order = { poNumber: 'X', lineItems: [{ ids: [{ value: 'A' }], quantity: { value: 10 } }] };
      const r = correlateAckToOrder(over, order);
      expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'qty-exceeds', ref: 'A' }));
    });

    it('sums ack lines per product before comparing (a split SKU cannot over-acknowledge undetected)', () => {
      const order = { poNumber: 'X', lineItems: [{ ids: [{ value: 'A' }], quantity: { value: 10 } }] };
      const splitAck = { poNumber: 'X', lineItems: [
        { ids: [{ value: 'A' }], quantity: { value: 6 } },
        { ids: [{ value: 'A' }], quantity: { value: 6 } }, // each ≤ 10, but 12 total > 10
      ] };
      const r = correlateAckToOrder(splitAck, order);
      expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'qty-exceeds', ref: 'A' }));
    });
  });
});
