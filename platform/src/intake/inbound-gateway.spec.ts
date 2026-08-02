import { InboundGateway } from './inbound-gateway';
import { InMemoryRawArtifactStore, RawArtifactStore } from './raw-artifact.store';
import { InMemoryDedupStore, DedupStore } from './dedup.store';
import { X12Service } from '../x12/x12.service';

const isa = (senderId: string, receiverId: string, icn: string) =>
  `ISA*00*          *00*          *ZZ*${senderId.padEnd(15)}*ZZ*${receiverId.padEnd(15)}*260801*1200*U*00401*${icn.padStart(9, '0')}*0*P*:~`;
const interchange = (opts: { sender?: string; receiver?: string; icn?: string; body?: string }) => {
  const { sender = 'ACME', receiver = 'BIGBOX', icn = '1', body = 'GS*PO*ACME*BIGBOX*20260801*1200*1*X*004010~ST*850*0001~BEG*00*SA*PO123**20260801~SE*3*0001~GE*1*1~IEA*1*000000001~' } = opts;
  return isa(sender, receiver, icn) + body;
};

const T = 't1';

describe('InboundGateway (intake trust boundary)', () => {
  let gw: InboundGateway;
  let raw: RawArtifactStore;
  let dedup: DedupStore;
  const at = (iso: string) => new Date(iso);

  beforeEach(() => {
    raw = new InMemoryRawArtifactStore();
    dedup = new InMemoryDedupStore();
    gw = new InboundGateway(raw, dedup, new X12Service());
  });

  it('accepts a first interchange, retains it immutably, and keys on the interchange identity', async () => {
    const r = await gw.receive(T, 'sftp:bigbox', interchange({}), at('2026-08-01T12:00:00Z'));
    expect(r.status).toBe('accepted');
    expect(r.occurrence).toBe(1);
    expect(r.conflict).toBe(false);
    expect(r.dedupKey).toBe('x12:ZZ:ACME>ZZ:BIGBOX#000000001');
    expect((await raw.get(T, r.artifact.id))?.bytes).toBe(interchange({}));
    expect(r.artifact.source).toBe('sftp:bigbox');
    expect(r.artifact.size).toBe(Buffer.byteLength(interchange({}), 'utf8'));
  });

  it('flags a byte-identical resend as a benign duplicate (not a conflict)', async () => {
    await gw.receive(T, 'sftp:bigbox', interchange({}), at('2026-08-01T12:00:00Z'));
    const r2 = await gw.receive(T, 'sftp:bigbox', interchange({}), at('2026-08-01T13:00:00Z'));
    expect(r2.status).toBe('duplicate');
    expect(r2.occurrence).toBe(2);
    expect(r2.conflict).toBe(false);
    expect(r2.firstSeenAt).toBe('2026-08-01T12:00:00.000Z');
  });

  it('dedups a resend that differs only in whitespace / line endings (logical identity, not bytes)', async () => {
    const base = interchange({});
    await gw.receive(T, 'sftp:bigbox', base, at('2026-08-01T12:00:00Z'));
    const r2 = await gw.receive(T, 'sftp:bigbox', base.replace(/~/g, '~\r\n'), at('2026-08-01T12:05:00Z'));
    expect(r2.status).toBe('duplicate');
    expect(r2.conflict).toBe(false);
  });

  it('CONFLICT: same interchange identity (ICN) but different business content → quarantine signal', async () => {
    await gw.receive(T, 'sftp:bigbox', interchange({ icn: '5' }), at('2026-08-01T12:00:00Z'));
    const tampered = interchange({ icn: '5', body: 'GS*PO*ACME*BIGBOX*20260801*1200*1*X*004010~ST*850*0001~BEG*00*SA*PO999**20260801~SE*3*0001~GE*1*1~IEA*1*000000005~' });
    const r2 = await gw.receive(T, 'sftp:bigbox', tampered, at('2026-08-01T12:10:00Z'));
    expect(r2.status).toBe('duplicate');
    expect(r2.conflict).toBe(true);
  });

  it('distinct ICNs from the same partner are independent (both accepted)', async () => {
    const a = await gw.receive(T, 'sftp:bigbox', interchange({ icn: '1' }), at('2026-08-01T12:00:00Z'));
    const b = await gw.receive(T, 'sftp:bigbox', interchange({ icn: '2' }), at('2026-08-01T12:01:00Z'));
    expect(a.status).toBe('accepted');
    expect(b.status).toBe('accepted');
  });

  it('isolates by tenant — same bytes for another tenant is a fresh accept', async () => {
    const bytes = interchange({ icn: '9' });
    const a = await gw.receive('t1', 'sftp:bigbox', bytes, at('2026-08-01T12:00:00Z'));
    const b = await gw.receive('t2', 'sftp:bigbox', bytes, at('2026-08-01T12:00:00Z'));
    expect(a.status).toBe('accepted');
    expect(b.status).toBe('accepted'); // different tenant, not a duplicate
  });

  it('falls back to a content-hash key for non-X12 payloads (e.g. a connector JSON)', async () => {
    const json = JSON.stringify({ poNumber: 'SHOP-1', items: [] });
    const r1 = await gw.receive(T, 'webhook:shopify', json, at('2026-08-01T12:00:00Z'));
    expect(r1.status).toBe('accepted');
    expect(r1.dedupKey).toBe(`sha256:${r1.artifact.id}`);
    const r2 = await gw.receive(T, 'webhook:shopify', json, at('2026-08-01T12:30:00Z'));
    expect(r2.status).toBe('duplicate');
    expect(r2.conflict).toBe(false);
  });

  it('retains an empty payload rather than dropping it', async () => {
    const r = await gw.receive(T, 'sftp:bigbox', '', at('2026-08-01T12:00:00Z'));
    expect(r.status).toBe('accepted');
    expect((await raw.get(T, r.artifact.id))?.bytes).toBe('');
    expect(r.dedupKey.startsWith('sha256:')).toBe(true);
  });

  it('register is atomic: the dedup ledger records exactly one entry per identity', async () => {
    await gw.receive(T, 'sftp:bigbox', interchange({ icn: '7' }), at('2026-08-01T12:00:00Z'));
    await gw.receive(T, 'sftp:bigbox', interchange({ icn: '7' }), at('2026-08-01T12:00:01Z'));
    await gw.receive(T, 'sftp:bigbox', interchange({ icn: '7' }), at('2026-08-01T12:00:02Z'));
    expect((await dedup.lookup(T, 'x12:ZZ:ACME>ZZ:BIGBOX#000000007'))?.occurrences).toBe(3);
  });
});
