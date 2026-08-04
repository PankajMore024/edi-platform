import { Kysely } from 'kysely';
import { createDatabase } from '../database';
import { createSchema } from '../migrations';
import { DB } from '../schema';
import { CertificationRepository } from './certification.repository';

describe('CertificationRepository (durable certification plane, node:sqlite)', () => {
  let db: Kysely<DB>;
  let repo: CertificationRepository;
  beforeEach(async () => { db = createDatabase({ sqliteFile: ':memory:' }); await createSchema(db); repo = new CertificationRepository(db); });
  afterEach(async () => { await db.destroy(); });

  const newSession = () => repo.createSession({ tenantId: 't1', relationshipId: 'rel-1', formatAuthority: 'client', specVersion: 'v1' });

  it('creates a draft session and reads it back (by id and by relationship), tenant-scoped', async () => {
    const s = await newSession();
    expect(s.status).toBe('draft');
    expect(await repo.getSession('t1', s.id)).toMatchObject({ relationshipId: 'rel-1', formatAuthority: 'client', specVersion: 'v1' });
    expect(await repo.getSessionByRelationship('t1', 'rel-1')).toMatchObject({ id: s.id });
    expect(await repo.getSession('t2', s.id)).toBeUndefined(); // other tenant can't see it
    expect(await repo.listSessions('t2')).toEqual([]);
  });

  it('records a test-file attempt with issues: bumps attempt count, sets doc status from verdict, stores issues', async () => {
    const s = await newSession();
    const doc = await repo.addDoc({ tenantId: 't1', sessionId: s.id, docType: '856', role: 'response', direction: 'inbound', producedBy: 'partner', validatedBy: 'client' });
    expect(doc.status).toBe('awaiting');

    const tf = await repo.recordTestFile({
      tenantId: 't1', certDocId: doc.id, rawArtifactId: 'raw-1', uploadedBy: 'partner', verdict: 'issues', correlated: true,
      issues: [
        { segment: 'HL', element: 'HL03', kind: 'conformance', severity: 'error', code: '1', message: 'parent ref missing', directedTo: 'partner', status: 'open' },
        { segment: 'REF', kind: 'conformance', severity: 'error', message: 'REF*BM required', aiSuggestion: 'map BOL number', directedTo: 'partner', status: 'open' },
      ],
    });
    expect(tf.attemptNo).toBe(1);
    expect(tf.issues).toHaveLength(2);

    const after = await repo.getDoc('t1', doc.id);
    expect(after).toMatchObject({ status: 'issues', attemptCount: 1 });

    const files = await repo.listTestFiles('t1', doc.id);
    expect(files).toHaveLength(1);
    expect(files[0].issues.map((i) => i.segment)).toEqual(['HL', 'REF']);
    expect(files[0].issues[1].aiSuggestion).toBe('map BOL number');
  });

  it('increments attempt numbers across re-drops (append-only history)', async () => {
    const s = await newSession();
    const doc = await repo.addDoc({ tenantId: 't1', sessionId: s.id, docType: '855', role: 'response', direction: 'inbound', producedBy: 'partner', validatedBy: 'client' });
    await repo.recordTestFile({ tenantId: 't1', certDocId: doc.id, rawArtifactId: 'r1', uploadedBy: 'partner', verdict: 'issues', correlated: true, issues: [] });
    const second = await repo.recordTestFile({ tenantId: 't1', certDocId: doc.id, rawArtifactId: 'r2', uploadedBy: 'partner', verdict: 'passed', correlated: true, issues: [] });
    expect(second.attemptNo).toBe(2);
    expect((await repo.getDoc('t1', doc.id))!.status).toBe('passed');
    expect(await repo.listTestFiles('t1', doc.id)).toHaveLength(2);
  });

  it('enforces the certify gate: a blocking doc that is not passed holds certification', async () => {
    const s = await newSession();
    const blocking = await repo.addDoc({ tenantId: 't1', sessionId: s.id, docType: '856', role: 'response', direction: 'inbound', producedBy: 'partner', validatedBy: 'client' });
    await repo.recordTestFile({ tenantId: 't1', certDocId: blocking.id, rawArtifactId: 'r1', uploadedBy: 'partner', verdict: 'issues', correlated: true, issues: [] });

    expect(await repo.canCertify('t1', s.id)).toBe(false);
    await expect(repo.certify('t1', s.id, 'ops@client')).rejects.toThrow(/cannot certify/);

    // Waiving the blocking doc satisfies the gate.
    await repo.setDocStatus('t1', blocking.id, 'waived');
    expect(await repo.canCertify('t1', s.id)).toBe(true);
    const certified = await repo.certify('t1', s.id, 'ops@client');
    expect(certified.status).toBe('certified');
    expect(certified.certifiedBy).toBe('ops@client');
    expect(certified.certifiedAt).toBeDefined();
  });

  it('a non-blocking doc with issues does not hold certification', async () => {
    const s = await newSession();
    const passing = await repo.addDoc({ tenantId: 't1', sessionId: s.id, docType: '855', role: 'response', direction: 'inbound', producedBy: 'partner', validatedBy: 'client' });
    await repo.recordTestFile({ tenantId: 't1', certDocId: passing.id, rawArtifactId: 'r1', uploadedBy: 'partner', verdict: 'passed', correlated: true, issues: [] });
    const cosmetic = await repo.addDoc({ tenantId: 't1', sessionId: s.id, docType: '846', role: 'standalone', direction: 'inbound', producedBy: 'partner', validatedBy: 'client', blocking: false });
    await repo.recordTestFile({ tenantId: 't1', certDocId: cosmetic.id, rawArtifactId: 'r2', uploadedBy: 'partner', verdict: 'warning', correlated: true, issues: [] });

    expect(await repo.canCertify('t1', s.id)).toBe(true);
  });

  it('stores messages as a durable bilateral thread (sent AND stored)', async () => {
    const s = await newSession();
    const m = await repo.addMessage({ tenantId: 't1', sessionId: s.id, authorRole: 'client', authorUserId: 'ops@client', body: 'Please fix the 856 HL nesting.' });
    expect(m.deliveredAt).toBeDefined();
    await repo.addMessage({ tenantId: 't1', sessionId: s.id, authorRole: 'partner', body: 'Fixed — re-uploaded.' });
    const thread = await repo.listMessages('t1', s.id);
    expect(thread.map((x) => x.authorRole)).toEqual(['client', 'partner']);
  });

  it('logs an append-only event feed with monotonic per-session seq', async () => {
    const s = await newSession(); // logs session_created
    const doc = await repo.addDoc({ tenantId: 't1', sessionId: s.id, docType: '855', role: 'response', direction: 'inbound', producedBy: 'partner', validatedBy: 'client' });
    await repo.recordTestFile({ tenantId: 't1', certDocId: doc.id, rawArtifactId: 'r1', uploadedBy: 'partner', verdict: 'passed', correlated: true, issues: [] });
    await repo.certify('t1', s.id, 'ops@client');

    const events = await repo.listEvents('t1', s.id);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]); // created, file_validated, certified
    expect(events.map((e) => e.verb)).toEqual(['session_created', 'file_validated', 'certified']);
  });
});
