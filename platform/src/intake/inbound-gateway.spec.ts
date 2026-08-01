import { Test } from '@nestjs/testing';
import { InboundGateway } from './inbound-gateway';
import { IntakeModule } from './intake.module';
import { RawArtifactStore } from './raw-artifact.store';
import { DedupStore } from './dedup.store';

// Minimal but valid interchange envelope. ISA: 00,«auth10»,00,«sec10»,ZZ,SENDER…,ZZ,RECV…,date,time,U,00401,ICN,0,P,:
const isa = (senderId: string, receiverId: string, icn: string) =>
  `ISA*00*          *00*          *ZZ*${senderId.padEnd(15)}*ZZ*${receiverId.padEnd(15)}*260801*1200*U*00401*${icn.padStart(9, '0')}*0*P*:~`;
const interchange = (opts: { sender?: string; receiver?: string; icn?: string; body?: string }) => {
  const { sender = 'ACME', receiver = 'BIGBOX', icn = '1', body = 'GS*PO*ACME*BIGBOX*20260801*1200*1*X*004010~ST*850*0001~BEG*00*SA*PO123**20260801~SE*3*0001~GE*1*1~IEA*1*000000001~' } = opts;
  return isa(sender, receiver, icn) + body;
};

describe('InboundGateway (intake trust boundary)', () => {
  let gw: InboundGateway;
  let raw: RawArtifactStore;
  let dedup: DedupStore;
  const at = (iso: string) => new Date(iso);

  beforeEach(async () => {
    const mod = await Test.createTestingModule({ imports: [IntakeModule] }).compile();
    gw = mod.get(InboundGateway);
    raw = mod.get(RawArtifactStore);
    dedup = mod.get(DedupStore);
  });

  it('accepts a first interchange, retains it immutably, and keys on the interchange identity', () => {
    const r = gw.receive('sftp:bigbox', interchange({}), at('2026-08-01T12:00:00Z'));
    expect(r.status).toBe('accepted');
    expect(r.occurrence).toBe(1);
    expect(r.conflict).toBe(false);
    expect(r.dedupKey).toBe('x12:ZZ:ACME>ZZ:BIGBOX#000000001');
    // retained verbatim, content-addressed, retrievable
    expect(raw.get(r.artifact.id)?.bytes).toBe(interchange({}));
    expect(r.artifact.source).toBe('sftp:bigbox');
    expect(r.artifact.size).toBe(Buffer.byteLength(interchange({}), 'utf8'));
  });

  it('flags a byte-identical resend as a benign duplicate (not a conflict)', () => {
    gw.receive('sftp:bigbox', interchange({}), at('2026-08-01T12:00:00Z'));
    const r2 = gw.receive('sftp:bigbox', interchange({}), at('2026-08-01T13:00:00Z'));
    expect(r2.status).toBe('duplicate');
    expect(r2.occurrence).toBe(2);
    expect(r2.conflict).toBe(false);
    expect(r2.firstSeenAt).toBe('2026-08-01T12:00:00.000Z'); // firstSeen preserved
  });

  it('dedups a resend that differs only in whitespace / line endings (logical identity, not bytes)', () => {
    const base = interchange({});
    gw.receive('sftp:bigbox', base, at('2026-08-01T12:00:00Z'));
    const reformatted = base.replace(/~/g, '~\r\n'); // same segments, different bytes
    const r2 = gw.receive('sftp:bigbox', reformatted, at('2026-08-01T12:05:00Z'));
    expect(r2.status).toBe('duplicate');
    expect(r2.conflict).toBe(false); // whitespace-only differences are NOT a conflict
  });

  it('CONFLICT: same interchange identity (ICN) but different business content → quarantine signal', () => {
    gw.receive('sftp:bigbox', interchange({ icn: '5' }), at('2026-08-01T12:00:00Z'));
    // same sender/receiver/ICN, but a different PO number in the body
    const tampered = interchange({ icn: '5', body: 'GS*PO*ACME*BIGBOX*20260801*1200*1*X*004010~ST*850*0001~BEG*00*SA*PO999**20260801~SE*3*0001~GE*1*1~IEA*1*000000005~' });
    const r2 = gw.receive('sftp:bigbox', tampered, at('2026-08-01T12:10:00Z'));
    expect(r2.status).toBe('duplicate');
    expect(r2.conflict).toBe(true);
  });

  it('distinct ICNs from the same partner are independent (both accepted)', () => {
    const a = gw.receive('sftp:bigbox', interchange({ icn: '1' }), at('2026-08-01T12:00:00Z'));
    const b = gw.receive('sftp:bigbox', interchange({ icn: '2' }), at('2026-08-01T12:01:00Z'));
    expect(a.status).toBe('accepted');
    expect(b.status).toBe('accepted');
  });

  it('falls back to a content-hash key for non-X12 payloads (e.g. a connector JSON)', () => {
    const json = JSON.stringify({ poNumber: 'SHOP-1', items: [] });
    const r1 = gw.receive('webhook:shopify', json, at('2026-08-01T12:00:00Z'));
    expect(r1.status).toBe('accepted');
    expect(r1.dedupKey).toBe(`sha256:${r1.artifact.id}`);
    const r2 = gw.receive('webhook:shopify', json, at('2026-08-01T12:30:00Z'));
    expect(r2.status).toBe('duplicate');
    expect(r2.conflict).toBe(false);
  });

  it('retains an empty payload rather than dropping it', () => {
    const r = gw.receive('sftp:bigbox', '', at('2026-08-01T12:00:00Z'));
    expect(r.status).toBe('accepted');
    expect(raw.get(r.artifact.id)?.bytes).toBe('');
    expect(r.dedupKey.startsWith('sha256:')).toBe(true);
  });

  it('register is atomic: the dedup ledger records exactly one entry per identity', () => {
    gw.receive('sftp:bigbox', interchange({ icn: '7' }), at('2026-08-01T12:00:00Z'));
    gw.receive('sftp:bigbox', interchange({ icn: '7' }), at('2026-08-01T12:00:01Z'));
    gw.receive('sftp:bigbox', interchange({ icn: '7' }), at('2026-08-01T12:00:02Z'));
    expect(dedup.lookup('x12:ZZ:ACME>ZZ:BIGBOX#000000007')?.occurrences).toBe(3);
  });
});
