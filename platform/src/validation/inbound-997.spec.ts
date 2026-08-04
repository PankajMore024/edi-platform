import { X12Service } from '../x12/x12.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EmitService } from '../mapping/engine/emit.service';
import { ConformanceValidator } from './conformance-validator';
import { HOUSE_997 } from './specs/house997';
import { correlate997ToGroup } from './correlation';
import { SAMPLE_997_MAP } from '../testing/fixtures';

/**
 * Inbound validation for the 997 Functional Acknowledgment — correlated not to an 850 but to the
 * functional GROUP we sent (its GS control number). This closes the acknowledgment loop.
 */
const PARTNER_997 = ['AK1*PO*1~', 'AK9*A*1*1*1~'].join('\n');

describe('inbound 997 validation', () => {
  const x12 = new X12Service();
  const ingest = new IngestService();
  const emit = new EmitService();
  const validator = new ConformanceValidator();

  it('a well-formed partner 997 conforms to the house 997 spec', () => {
    const r = validator.validate(x12.parse(PARTNER_997), HOUSE_997);
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('ingests the 997 into the canonical acknowledgment shape', () => {
    const doc = ingest.ingest(x12.parse(PARTNER_997), SAMPLE_997_MAP) as any;
    expect(doc.ackFunctionalId).toBe('PO');
    expect(doc.ackGroupControlNumber).toBe('1');
    expect(doc.ackCode).toBe('A');
  });

  it('round-trips: ingest then re-emit reproduces the wire', () => {
    const segs = x12.parse(PARTNER_997);
    expect(emit.emit(ingest.ingest(segs, SAMPLE_997_MAP), SAMPLE_997_MAP)).toEqual(segs);
  });

  it('correlates to the group we sent, and flags a wrong control number', () => {
    const ack = ingest.ingest(x12.parse(PARTNER_997), SAMPLE_997_MAP) as any;
    expect(correlate997ToGroup(ack, { groupControlNumber: '1', functionalId: 'PO' }).correlated).toBe(true);

    const wrong = correlate997ToGroup(ack, { groupControlNumber: '77', functionalId: 'PO' });
    expect(wrong.correlated).toBe(false);
    expect(wrong.issues[0].kind).toBe('control-mismatch');
  });
});
