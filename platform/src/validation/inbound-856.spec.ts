import { X12Service } from '../x12/x12.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EmitService } from '../mapping/engine/emit.service';
import { ConformanceValidator } from './conformance-validator';
import { HOUSE_856 } from './specs/house856';
import { correlateShipToOrder } from './correlation';
import { SAMPLE_856_MAP, SAMPLE_DOC } from '../testing/fixtures';

/**
 * Inbound validation for the 856 ASN — the hierarchical response doc (BSN + HL S→O→I). Proves we can
 * validate, ingest the HL hierarchy, round-trip it, and correlate the shipment back to the 850.
 */
const PARTNER_856 = [
  'BSN*00*SHIP-1*20260731~',
  'HL*1**S~',
  'HL*2*1*O~',
  'PRF*4500~',
  'HL*3*2*I~',
  'LIN*1*UP*012345678905~',
  'SN1**10*EA~',
  'HL*4*2*I~',
  'LIN*2*UP*099887766554~',
  'SN1**5*EA~',
  'CTT*1~',
].join('\n');

describe('inbound 856 validation', () => {
  const x12 = new X12Service();
  const ingest = new IngestService();
  const emit = new EmitService();
  const validator = new ConformanceValidator();

  it('a well-formed partner 856 conforms to the house 856 spec', () => {
    const r = validator.validate(x12.parse(PARTNER_856), HOUSE_856);
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('ingests the HL hierarchy into shipment → orders → items', () => {
    const doc = ingest.ingest(x12.parse(PARTNER_856), SAMPLE_856_MAP) as any;
    expect(doc.shipmentId).toBe('SHIP-1');
    expect(doc.orders).toHaveLength(1);
    expect(doc.orders[0].poNumber).toBe('4500');
    expect(doc.orders[0].items).toEqual([
      { lineNumber: '1', quantity: { value: 10, uom: 'EA' }, ids: [{ value: '012345678905' }] },
      { lineNumber: '2', quantity: { value: 5, uom: 'EA' }, ids: [{ value: '099887766554' }] },
    ]);
    expect(doc.inbound.unmapped).toEqual([]);
  });

  it('round-trips: ingest then re-emit regenerates the HL numbering exactly', () => {
    const segs = x12.parse(PARTNER_856);
    expect(emit.emit(ingest.ingest(segs, SAMPLE_856_MAP), SAMPLE_856_MAP)).toEqual(segs);
  });

  it('flags a shipped line not on the order and a PO the shipment does not carry', () => {
    const ship = ingest.ingest(x12.parse(PARTNER_856), SAMPLE_856_MAP) as any;
    expect(correlateShipToOrder(ship, SAMPLE_DOC).correlated).toBe(true);

    const wrongPo = correlateShipToOrder(ship, { ...SAMPLE_DOC, poNumber: '9999' });
    expect(wrongPo.correlated).toBe(false);
    expect(wrongPo.issues[0].kind).toBe('po-mismatch');

    const overShip = { orders: [{ poNumber: '4500', items: [{ ids: [{ value: '012345678905' }], quantity: { value: 999 } }] }] };
    const r = correlateShipToOrder(overShip, SAMPLE_DOC);
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'qty-exceeds', ref: '012345678905' }));
  });
});
