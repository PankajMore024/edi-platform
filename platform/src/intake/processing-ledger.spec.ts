import { InMemoryProcessingLedger, ProcessingRecordInput } from './processing-ledger';

const base: ProcessingRecordInput = {
  tenantId: 't1', relationshipId: 'rel', outcome: 'accepted', source: 'sftp:acme',
  receivedAt: '2026-08-02T09:00:00.000Z', artifactId: 'a1', dedupKey: 'x12:...#1', occurrence: 1,
  delivered: true, needsReview: false,
};

describe('ProcessingLedger', () => {
  it('assigns ids and returns copies (append-only, no external mutation)', () => {
    const l = new InMemoryProcessingLedger();
    const rec = l.record(base);
    expect(rec.id).toBe('evt-1');
    rec.outcome = 'rejected'; // mutate the returned copy
    expect(l.get('evt-1')!.outcome).toBe('accepted'); // stored copy is untouched
  });

  it('filters by outcome / relationship / needsReview', () => {
    const l = new InMemoryProcessingLedger();
    l.record(base);
    l.record({ ...base, outcome: 'conflict', artifactId: 'a2', dedupKey: 'k2', needsReview: true });
    l.record({ ...base, relationshipId: 'other', artifactId: 'a3', dedupKey: 'k3' });

    expect(l.list({ outcome: 'conflict' })).toHaveLength(1);
    expect(l.list({ relationshipId: 'rel' })).toHaveLength(2);
    expect(l.needingReview('t1').map((r) => r.outcome)).toEqual(['conflict']);
  });

  it('timeline() returns all events for one interchange identity, oldest first', () => {
    const l = new InMemoryProcessingLedger();
    l.record({ ...base });
    l.record({ ...base, occurrence: 2, outcome: 'duplicate' });
    l.record({ ...base, dedupKey: 'other-doc' });
    expect(l.timeline('x12:...#1').map((r) => r.occurrence)).toEqual([1, 2]);
  });
});
