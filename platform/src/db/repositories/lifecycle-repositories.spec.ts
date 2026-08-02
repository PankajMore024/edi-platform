import { Kysely } from 'kysely';
import { createDatabase } from '../database';
import { createSchema } from '../migrations';
import { DB } from '../schema';
import { RawArtifactRepository } from './raw-artifact.repository';
import { DedupRepository } from './dedup.repository';
import { ProcessingRepository } from './processing.repository';
import { ProcessingRecordInput } from '../../intake/processing-ledger';

describe('lifecycle repositories (durable, on node:sqlite)', () => {
  let db: Kysely<DB>;
  const at = (iso: string) => new Date(iso);
  beforeEach(async () => { db = createDatabase({ sqliteFile: ':memory:' }); await createSchema(db); });
  afterEach(async () => { await db.destroy(); });

  describe('RawArtifactRepository', () => {
    it('retains content-addressed, first-write-wins, tenant-scoped', async () => {
      const repo = new RawArtifactRepository(db);
      const a = await repo.put('t1', 'sftp:x', 'HELLO', at('2026-08-02T10:00:00Z'));
      expect(a.id).toHaveLength(64); // sha256 hex
      expect(a.size).toBe(5);

      const again = await repo.put('t1', 'other-source', 'HELLO', at('2026-08-02T11:00:00Z'));
      expect(again).toEqual(a); // same content → original row returned (immutable)
      expect(await repo.get('t1', a.id)).toEqual(a);
      expect(await repo.get('t2', a.id)).toBeUndefined(); // isolated by tenant
    });
  });

  describe('DedupRepository', () => {
    it('atomically registers first occurrence then increments', async () => {
      const repo = new DedupRepository(db);
      const r1 = await repo.register('t1', 'k#1', 'art-a', 'fp-a', at('2026-08-02T10:00:00Z'));
      expect(r1).toMatchObject({ occurrences: 1, firstArtifactId: 'art-a', firstFingerprint: 'fp-a' });
      const r2 = await repo.register('t1', 'k#1', 'art-b', 'fp-b', at('2026-08-02T10:05:00Z'));
      expect(r2.occurrences).toBe(2);
      expect(r2.firstArtifactId).toBe('art-a'); // first occurrence preserved
      expect(r2.firstSeenAt).toBe('2026-08-02T10:00:00.000Z');
      expect((await repo.lookup('t1', 'k#1'))!.occurrences).toBe(2);
      expect(await repo.lookup('t2', 'k#1')).toBeUndefined();
    });
  });

  describe('ProcessingRepository', () => {
    const base = (over: Partial<ProcessingRecordInput> = {}): ProcessingRecordInput => ({
      tenantId: 't1', relationshipId: 'rel', outcome: 'accepted', source: 'sftp:x',
      receivedAt: '2026-08-02T10:00:00.000Z', artifactId: 'art-a', dedupKey: 'k#1', occurrence: 1,
      delivered: true, needsReview: false, ...over,
    });

    it('records, round-trips booleans/nulls, and filters', async () => {
      const repo = new ProcessingRepository(db);
      const acc = await repo.record(base({ docType: '850', valid: true, ackControlNumber: '77' }));
      expect(acc.id).toBeDefined();
      expect(acc).toMatchObject({ outcome: 'accepted', delivered: true, valid: true, needsReview: false, docType: '850', ackControlNumber: '77' });
      await repo.record(base({ outcome: 'rejected', delivered: false, valid: false, needsReview: true, artifactId: 'art-b', dedupKey: 'k#2', errorCount: 2 }));

      expect((await repo.list({ tenantId: 't1' }))).toHaveLength(2);
      expect((await repo.list({ outcome: 'rejected' }))).toHaveLength(1);
      const got = await repo.get(acc.id);
      expect(got).toEqual(acc);
    });

    it('review queue excludes resolved; resolve() stamps in place', async () => {
      const repo = new ProcessingRepository(db);
      const rej = await repo.record(base({ outcome: 'rejected', delivered: false, needsReview: true }));
      expect((await repo.needingReview('t1')).map((r) => r.id)).toEqual([rej.id]);

      const resolved = await repo.resolve(rej.id, { resolution: 'reprocessed', resolvedBy: 'ops', resolvedAt: '2026-08-02T12:00:00.000Z', resolutionEventId: 'evt-x' });
      expect(resolved).toMatchObject({ resolution: 'reprocessed', resolvedBy: 'ops', resolutionEventId: 'evt-x' });
      expect(await repo.needingReview('t1')).toHaveLength(0); // resolved → out of the queue
      await expect(repo.resolve('nope', { resolution: 'dismissed' })).rejects.toThrow(/not found/);
    });

    it('timeline returns one identity’s events oldest-first, tenant-scoped', async () => {
      const repo = new ProcessingRepository(db);
      await repo.record(base({ receivedAt: '2026-08-02T10:00:00.000Z' }));
      await repo.record(base({ outcome: 'duplicate', occurrence: 2, receivedAt: '2026-08-02T10:00:00.000Z' }));
      await repo.record(base({ dedupKey: 'other' }));
      const tl = await repo.timeline('t1', 'k#1');
      expect(tl.map((r) => r.outcome)).toEqual(['accepted', 'duplicate']);
    });
  });
});
