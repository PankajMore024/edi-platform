import { X12Service } from '../x12/x12.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EmitService } from '../mapping/engine/emit.service';
import { ConformanceValidator } from './conformance-validator';
import { HOUSE_810 } from './specs/house810';
import { correlateInvoiceToOrder } from './correlation';
import { SAMPLE_810_MAP, SAMPLE_DOC } from '../testing/fixtures';

/**
 * Inbound validation for the 810 Invoice. Beyond conformance + PO/line correlation, the invoice total
 * (TDS) is reconciled against the sum of line extensions with decimal math (never float).
 */
const PARTNER_810 = [
  'BIG*20260731*INV-77**4500~',
  'N1*BT*ACME HQ~',
  'IT1*1*10*EA*18.50**UP*012345678905~',
  'IT1*2*5*EA*44.00**UP*099887766554~',
  'TDS*405.00~',
  'CTT*2~',
].join('\n');

describe('inbound 810 validation', () => {
  const x12 = new X12Service();
  const ingest = new IngestService();
  const emit = new EmitService();
  const validator = new ConformanceValidator();

  it('a well-formed partner 810 conforms to the house 810 spec', () => {
    const r = validator.validate(x12.parse(PARTNER_810), HOUSE_810);
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('ingests the 810 into the canonical invoice shape', () => {
    const doc = ingest.ingest(x12.parse(PARTNER_810), SAMPLE_810_MAP) as any;
    expect(doc.invoiceNumber).toBe('INV-77');
    expect(doc.poNumber).toBe('4500');
    expect(doc.totalAmount).toBe(405);
    expect(doc.lineItems).toHaveLength(2);
  });

  it('round-trips: ingest then re-emit reproduces the wire', () => {
    const segs = x12.parse(PARTNER_810);
    expect(emit.emit(ingest.ingest(segs, SAMPLE_810_MAP), SAMPLE_810_MAP)).toEqual(segs);
  });

  it('correlates to the 850 and reconciles the invoice total to the line sum', () => {
    const inv = ingest.ingest(x12.parse(PARTNER_810), SAMPLE_810_MAP) as any;
    expect(correlateInvoiceToOrder(inv, SAMPLE_DOC).correlated).toBe(true);
  });

  it('flags a total that does not equal the sum of line extensions', () => {
    const bad = { poNumber: '4500', totalAmount: 500, lineItems: SAMPLE_DOC.lineItems }; // real sum is 405
    const r = correlateInvoiceToOrder(bad, SAMPLE_DOC);
    expect(r.correlated).toBe(false);
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'total-mismatch' }));
  });
});
