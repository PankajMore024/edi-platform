import { EnvelopeService, EnvelopeConfig, InterchangeContext } from './envelope.service';
import { EmitService } from '../mapping/engine/emit.service';
import { X12Service } from '../x12/x12.service';
import { SAMPLE_DOC, SAMPLE_MAP } from '../testing/fixtures';
import { assertGolden } from '../testing/golden';

describe('EnvelopeService', () => {
  const env = new EnvelopeService();
  const emit = new EmitService();
  const x12 = new X12Service();

  const config: EnvelopeConfig = {
    senderQualifier: 'ZZ',
    senderId: 'ACME',
    receiverQualifier: 'ZZ',
    receiverId: 'RETAILER',
    gsVersion: '004010',
  };

  const ctx: InterchangeContext = {
    config,
    control: { isa13: '1', gs06: '1', st02: '0001' },
    functionalId: 'PO',
    transactionSetCode: '850',
    timestamp: new Date('2026-07-31T09:05:00Z'),
  };

  it('wraps the sample 850 body in a full interchange (golden, byte-for-byte)', () => {
    const body = emit.emit(SAMPLE_DOC, SAMPLE_MAP);
    const out = x12.serialize(env.buildInterchange(body, ctx));
    assertGolden('acme/850/outbound/4010.interchange.edi', out);
  });

  it('computes the SE segment count including ST and SE, and fixed-width ISA ids', () => {
    const body = emit.emit(SAMPLE_DOC, SAMPLE_MAP); // 6 body segments
    const segs = env.buildInterchange(body, ctx);
    const byTag = (t: string) => segs.find((s) => s.tag === t)!;

    expect(byTag('SE').elements).toEqual(['8', '0001']); // 6 body + ST + SE
    expect(byTag('GE').elements).toEqual(['1', '1']);
    expect(byTag('IEA').elements).toEqual(['1', '000000001']); // ISA13 zero-padded to 9
    expect(byTag('ISA').elements[5]).toBe('ACME'.padEnd(15)); // fixed-width sender id (15)
    expect(byTag('ISA').elements[7]).toBe('RETAILER'.padEnd(15));
    expect(byTag('ISA').elements[8]).toBe('260731'); // YYMMDD (UTC)
  });

  it('parseInterchange unwraps the body and header identifiers (round-trip)', () => {
    const body = emit.emit(SAMPLE_DOC, SAMPLE_MAP);
    const full = env.buildInterchange(body, ctx);
    const parsed = env.parseInterchange(full);

    expect(parsed.functionalId).toBe('PO');
    expect(parsed.transactionSetCode).toBe('850');
    expect(parsed.control).toEqual({ isa13: '000000001', gs06: '1', st02: '0001' });
    expect(parsed.body).toEqual(body); // envelope stripped, body intact
  });
});
