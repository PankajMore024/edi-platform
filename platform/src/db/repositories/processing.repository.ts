import { randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB, ProcessingEventTable } from '../schema';
import { ProcessingRecord, ProcessingRecordInput, ProcessingQuery, ResolutionPatch } from '../../intake/processing-ledger';

const b = (v: boolean | undefined): number | null => (v === undefined ? null : v ? 1 : 0);
const fromB = (v: number | null): boolean | undefined => (v == null ? undefined : v === 1);
const nz = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/**
 * Durable, append-only processing-event ledger (the DB form of ProcessingLedger). One row per
 * document lifecycle event; conflicts/rejects surface via the review queue; resolutions are stamped in
 * place. Multi-tenant — reads are tenant-scoped. `record`/`resolve` mirror the in-memory contract.
 */
export class ProcessingRepository {
  private lastStamp = 0;
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * A strictly-increasing system timestamp for stable audit ordering. Wall-clock is only millisecond-
   * resolution, so a burst of events in one ms would otherwise tie and reorder (the id tiebreak is a
   * random uuid). Bumping by 1ms on collision guarantees a deterministic `created_at` order — the
   * lifecycle timeline of a document must never shuffle.
   */
  private nextStamp(): string {
    const now = Date.now();
    this.lastStamp = now > this.lastStamp ? now : this.lastStamp + 1;
    return new Date(this.lastStamp).toISOString();
  }

  async record(entry: ProcessingRecordInput): Promise<ProcessingRecord> {
    const id = randomUUID();
    const row: ProcessingEventTable = {
      id, tenant_id: entry.tenantId, relationship_id: entry.relationshipId,
      transaction_id: entry.transactionId ?? null, interchange_id: entry.interchangeId ?? null,
      outcome: entry.outcome, source: entry.source, received_at: entry.receivedAt,
      artifact_id: entry.artifactId, dedup_key: entry.dedupKey, occurrence: entry.occurrence,
      doc_type: entry.docType ?? null,
      functional_group_control_number: entry.functionalGroupControlNumber ?? null,
      transaction_control_number: entry.transactionControlNumber ?? null,
      first_artifact_id: entry.firstArtifactId ?? null, first_seen_at: entry.firstSeenAt ?? null,
      valid: b(entry.valid), error_count: entry.errorCount ?? null,
      delivered: b(entry.delivered) as number, ack_control_number: entry.ackControlNumber ?? null,
      needs_review: b(entry.needsReview) as number, note: entry.note ?? null,
      resolution: entry.resolution ?? null, resolved_at: entry.resolvedAt ?? null, resolved_by: entry.resolvedBy ?? null,
      resolution_note: entry.resolutionNote ?? null, resolution_event_id: entry.resolutionEventId ?? null,
      created_at: this.nextStamp(),
    };
    await this.db.insertInto('processing_event').values(row).execute();
    return this.toRecord(row);
  }

  async get(id: string): Promise<ProcessingRecord | undefined> {
    const r = await this.db.selectFrom('processing_event').selectAll().where('id', '=', id).executeTakeFirst();
    return r ? this.toRecord(r) : undefined;
  }

  async list(query: ProcessingQuery = {}): Promise<ProcessingRecord[]> {
    let q = this.db.selectFrom('processing_event').selectAll();
    if (query.tenantId !== undefined) q = q.where('tenant_id', '=', query.tenantId);
    if (query.relationshipId !== undefined) q = q.where('relationship_id', '=', query.relationshipId);
    if (query.outcome !== undefined) q = q.where('outcome', '=', query.outcome);
    if (query.needsReview !== undefined) q = q.where('needs_review', '=', query.needsReview ? 1 : 0);
    q = q.orderBy('created_at').orderBy('id');
    return (await q.execute()).map((r) => this.toRecord(r));
  }

  /** Full lifecycle of one interchange identity, oldest first. Tenant-scoped. */
  async timeline(tenantId: string, dedupKey: string): Promise<ProcessingRecord[]> {
    const rows = await this.db.selectFrom('processing_event').selectAll()
      .where('tenant_id', '=', tenantId).where('dedup_key', '=', dedupKey)
      .orderBy('created_at').orderBy('id').execute();
    return rows.map((r) => this.toRecord(r));
  }

  /** Open review queue: flagged for review and not yet resolved. */
  async needingReview(tenantId?: string): Promise<ProcessingRecord[]> {
    let q = this.db.selectFrom('processing_event').selectAll().where('needs_review', '=', 1).where('resolved_at', 'is', null);
    if (tenantId !== undefined) q = q.where('tenant_id', '=', tenantId);
    return (await q.orderBy('created_at').orderBy('id').execute()).map((r) => this.toRecord(r));
  }

  async resolve(id: string, patch: ResolutionPatch): Promise<ProcessingRecord> {
    const res = await this.db.updateTable('processing_event').set({
      resolution: patch.resolution ?? null, resolved_at: patch.resolvedAt ?? null, resolved_by: patch.resolvedBy ?? null,
      resolution_note: patch.resolutionNote ?? null, resolution_event_id: patch.resolutionEventId ?? null,
    }).where('id', '=', id).executeTakeFirst();
    if (!res.numUpdatedRows) throw new Error(`processing event ${id} not found`);
    return (await this.get(id)) as ProcessingRecord;
  }

  private toRecord(r: ProcessingEventTable): ProcessingRecord {
    return {
      id: r.id, tenantId: r.tenant_id, relationshipId: r.relationship_id,
      transactionId: nz(r.transaction_id), interchangeId: nz(r.interchange_id),
      outcome: r.outcome as ProcessingRecord['outcome'], source: r.source, receivedAt: r.received_at,
      artifactId: r.artifact_id, dedupKey: r.dedup_key, occurrence: r.occurrence,
      docType: nz(r.doc_type),
      functionalGroupControlNumber: nz(r.functional_group_control_number),
      transactionControlNumber: nz(r.transaction_control_number),
      firstArtifactId: nz(r.first_artifact_id), firstSeenAt: nz(r.first_seen_at),
      valid: fromB(r.valid), errorCount: nz(r.error_count),
      delivered: r.delivered === 1, ackControlNumber: nz(r.ack_control_number),
      needsReview: r.needs_review === 1, note: nz(r.note),
      resolution: nz(r.resolution) as ProcessingRecord['resolution'], resolvedAt: nz(r.resolved_at),
      resolvedBy: nz(r.resolved_by), resolutionNote: nz(r.resolution_note), resolutionEventId: nz(r.resolution_event_id),
    };
  }
}
