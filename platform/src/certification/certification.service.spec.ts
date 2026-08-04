import { Kysely } from 'kysely';
import { createDatabase } from '../db/database';
import { createSchema } from '../db/migrations';
import { DB } from '../db/schema';
import { CertificationRepository } from '../db/repositories/certification.repository';
import { RawArtifactRepository } from '../db/repositories/raw-artifact.repository';
import { RelationshipRepository } from '../db/repositories/relationship.repository';
import { DocSpecRepository, PartnerMapRepository } from '../db/repositories/config-repositories';
import { X12Service } from '../x12/x12.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EmitService } from '../mapping/engine/emit.service';
import { ConformanceValidator } from '../validation/conformance-validator';
import { CertificationService } from './certification.service';
import { SAMPLE_MAP, SAMPLE_DOC, SAMPLE_855_MAP } from '../testing/fixtures';
import { TradingRelationship } from '../control-plane/config.types';

/**
 * Integration test for the certification service — the real orchestration (store → conformance → ingest
 * → correlate → verdict → durable record), over node:sqlite with the actual engine services.
 */
describe('CertificationService (orchestration, node:sqlite)', () => {
  let db: Kysely<DB>;
  let svc: CertificationService;
  let x12: X12Service;

  const REL: TradingRelationship = {
    id: 'rel-1', tenantId: 't1', partnerId: 'acme', formatAuthority: 'client', tenantRole: 'buyer',
    version: '004010', mode: 'test',
    envelope: { senderQualifier: 'ZZ', senderId: 'US', receiverQualifier: 'ZZ', receiverId: 'ACME', gsVersion: '004010' },
    documents: [
      { docType: '850', direction: 'outbound', mapId: 'm850', enabled: true },
      { docType: '855', direction: 'inbound', mapId: 'm855', enabled: true },
    ],
    active: true,
  };

  const GOOD_855 = ['BAK*00*AC*4500*20260731~', 'PO1*1*10*EA*18.50**UP*012345678905~', 'ACK*IA*10*EA~', 'PO1*2*5*EA*44.00**UP*099887766554~', 'ACK*IA*5*EA~', 'CTT*2~'].join('\n');
  const WRONG_PO_855 = ['BAK*00*AC*9999*20260731~', 'PO1*1*10*EA*18.50**UP*012345678905~', 'ACK*IA*10*EA~', 'CTT*1~'].join('\n');
  const MALFORMED_855 = ['BAK*00*AC**20260731~', 'PO1*1*10*EA*18.50**UP*012345678905~', 'ACK*ZZ*10*EA~', 'CTT*1~'].join('\n');

  beforeEach(async () => {
    db = createDatabase({ sqliteFile: ':memory:' });
    await createSchema(db);
    x12 = new X12Service();
    svc = new CertificationService(
      new CertificationRepository(db), new RawArtifactRepository(db), new RelationshipRepository(db),
      new DocSpecRepository(db), new PartnerMapRepository(db), x12, new IngestService(), new ConformanceValidator(),
    );
    const maps = new PartnerMapRepository(db);
    await new RelationshipRepository(db).save(REL);
    await maps.save('t1', 'm850', SAMPLE_MAP);
    await maps.save('t1', 'm855', SAMPLE_855_MAP);
  });
  afterEach(async () => { await db.destroy(); });

  // Open a session and set the anchor 850 reference (our gold sample), returning the 855 response doc.
  async function openWithAnchor() {
    const { session, docs } = await svc.openSession('t1', 'rel-1');
    const anchor = docs.find((d) => d.role === 'anchor')!;
    const response = docs.find((d) => d.docType === '855')!;
    const anchor850 = x12.serialize(new EmitService().emit(SAMPLE_DOC, SAMPLE_MAP));
    await svc.setReference('t1', anchor.id, anchor850);
    return { session, anchor, response };
  }

  it('seeds a card per relationship document with authority-derived roles', async () => {
    const { docs } = await svc.openSession('t1', 'rel-1');
    expect(docs).toHaveLength(2);
    const anchor = docs.find((d) => d.docType === '850')!;
    const response = docs.find((d) => d.docType === '855')!;
    expect(anchor).toMatchObject({ role: 'anchor', producedBy: 'client', validatedBy: 'partner', blocking: false });
    expect(response).toMatchObject({ role: 'response', producedBy: 'partner', validatedBy: 'client', blocking: true });
  });

  it('a good 855 passes conformance AND correlates to the anchor 850', async () => {
    const { response } = await openWithAnchor();
    const tf = await svc.dropFile('t1', response.id, GOOD_855, 'partner');
    expect(tf.verdict).toBe('passed');
    expect(tf.correlated).toBe(true);
    expect(tf.issues).toEqual([]);
  });

  it('a conformance defect is recorded as an issue and fails the verdict', async () => {
    const { response } = await openWithAnchor();
    const tf = await svc.dropFile('t1', response.id, MALFORMED_855, 'partner');
    expect(tf.verdict).toBe('issues');
    expect(tf.issues.some((i) => i.kind === 'conformance' && i.segment === 'BAK')).toBe(true);
    expect(tf.issues.every((i) => i.directedTo === 'partner')).toBe(true); // the producer must fix
  });

  it('a well-formed 855 that acks the WRONG PO fails on correlation', async () => {
    const { response } = await openWithAnchor();
    const tf = await svc.dropFile('t1', response.id, WRONG_PO_855, 'partner');
    expect(tf.verdict).toBe('issues');
    expect(tf.correlated).toBe(false);
    expect(tf.issues.some((i) => i.kind === 'correlation')).toBe(true);
  });

  it('holds certification until the blocking response passes, then certifies', async () => {
    const { session, response } = await openWithAnchor();
    await svc.dropFile('t1', response.id, MALFORMED_855, 'partner'); // fails → holds
    await expect(svc.certify('t1', session.id, 'ops@client')).rejects.toThrow(/cannot certify/);

    await svc.dropFile('t1', response.id, GOOD_855, 'partner'); // now passes
    const detail = await svc.getSessionDetail('t1', session.id);
    expect(detail.canCertify).toBe(true);
    const certified = await svc.certify('t1', session.id, 'ops@client');
    expect(certified.status).toBe('certified');
  });

  it('records every step in the durable event feed', async () => {
    const { session, response } = await openWithAnchor();
    await svc.dropFile('t1', response.id, GOOD_855, 'partner');
    await svc.addMessage('t1', session.id, { authorRole: 'client', body: 'Looks good, certifying.' });
    const events = await svc.listEvents('t1', session.id);
    expect(events.map((e) => e.verb)).toEqual(expect.arrayContaining(['session_created', 'reference_set', 'file_validated', 'message_sent']));
    expect(events.every((e, i) => i === 0 || e.seq > events[i - 1].seq)).toBe(true); // strictly increasing
  });
});
