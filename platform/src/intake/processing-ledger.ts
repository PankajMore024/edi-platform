import { Injectable } from '@nestjs/common';

/**
 * The outcome of processing one inbound document. Defined here (the intake layer) so both the gateway
 * side and the control-plane pipeline share one vocabulary without a circular dependency.
 */
export type ProcessingOutcome =
  | 'accepted' // conformant → delivered + acknowledged
  | 'rejected' // non-conformant → not delivered, rejected via 997
  | 'duplicate' // already processed → idempotent skip
  | 'conflict'; // same interchange identity, different content → quarantined for review

/** One immutable event in a document's lifecycle. Every inbound receipt writes exactly one. */
export interface ProcessingRecord {
  id: string;
  tenantId: string;
  relationshipId: string;
  /** Links to the durable lifecycle rows (set by the DB-backed pipeline; absent in the in-memory M1). */
  transactionId?: string;
  interchangeId?: string;
  outcome: ProcessingOutcome;
  source: string;
  receivedAt: string;
  /** The raw artifact retained for THIS event (always present — even duplicates/conflicts are kept). */
  artifactId: string;
  dedupKey: string;
  occurrence: number;
  docType?: string;
  /** For per-transaction events: the functional-group (GS06) and transaction-set (ST02) control
   * numbers, so each transaction set in a BATCHED interchange has its own identifiable lifecycle. */
  functionalGroupControlNumber?: string;
  transactionControlNumber?: string;
  /** For duplicate/conflict: the original artifact this one duplicates or conflicts with. */
  firstArtifactId?: string;
  firstSeenAt?: string;
  /** Conformance summary (accepted/rejected outcomes). */
  valid?: boolean;
  errorCount?: number;
  /** Whether the document was delivered into the customer system. */
  delivered: boolean;
  /** ISA13 control number of the generated 997, when one was produced. */
  ackControlNumber?: string;
  /** True when a human must look at this event before it's considered handled (conflicts; rejects). */
  needsReview: boolean;
  note?: string;

  // ── resolution (set when an operator works a review-queue item) ──
  /** How the event was resolved. Unset while it is still open in the review queue. */
  resolution?: 'dismissed' | 'reprocessed';
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  /** For `reprocessed`: the id of the NEW processing event the reprocess produced. */
  resolutionEventId?: string;
}

/** The fields an operator resolution stamps onto a review event. */
export type ResolutionPatch = Pick<
  ProcessingRecord,
  'resolution' | 'resolvedAt' | 'resolvedBy' | 'resolutionNote' | 'resolutionEventId'
>;

/** What the caller supplies; `id` is assigned by the ledger. */
export type ProcessingRecordInput = Omit<ProcessingRecord, 'id'>;

export interface ProcessingQuery {
  tenantId?: string;
  relationshipId?: string;
  outcome?: ProcessingOutcome;
  needsReview?: boolean;
}

/**
 * Append-only audit log of every inbound document's lifecycle. Nothing is ever dropped silently:
 * accepted, rejected, duplicate, and conflict events all land here, so an operator can trace any
 * document end-to-end and work a review queue for the ones that need attention. A durable DB impl
 * swaps in behind this abstract class.
 */
export abstract class ProcessingLedger {
  abstract record(entry: ProcessingRecordInput): Promise<ProcessingRecord>;
  abstract get(id: string): Promise<ProcessingRecord | undefined>;
  abstract list(query?: ProcessingQuery): Promise<ProcessingRecord[]>;
  /** Every event for one interchange identity, oldest first — the full lifecycle of that document. */
  abstract timeline(tenantId: string, dedupKey: string): Promise<ProcessingRecord[]>;
  /** The review queue: OPEN events awaiting human attention (conflicts, rejects — not yet resolved).
   * Optionally scoped to one relationship (a partner's exceptions). */
  abstract needingReview(tenantId?: string, relationshipId?: string): Promise<ProcessingRecord[]>;
  /** Stamp an operator resolution onto a review event. */
  abstract resolve(id: string, patch: ResolutionPatch): Promise<ProcessingRecord>;
}

@Injectable()
export class InMemoryProcessingLedger extends ProcessingLedger {
  private readonly records: ProcessingRecord[] = [];
  private seq = 0;

  async record(entry: ProcessingRecordInput): Promise<ProcessingRecord> {
    this.seq += 1;
    const rec: ProcessingRecord = { ...entry, id: `evt-${this.seq}` };
    this.records.push(rec);
    return { ...rec };
  }

  async get(id: string): Promise<ProcessingRecord | undefined> {
    const r = this.records.find((x) => x.id === id);
    return r ? { ...r } : undefined;
  }

  async list(query: ProcessingQuery = {}): Promise<ProcessingRecord[]> {
    return this.records
      .filter((r) => (query.tenantId === undefined || r.tenantId === query.tenantId))
      .filter((r) => (query.relationshipId === undefined || r.relationshipId === query.relationshipId))
      .filter((r) => (query.outcome === undefined || r.outcome === query.outcome))
      .filter((r) => (query.needsReview === undefined || r.needsReview === query.needsReview))
      .map((r) => ({ ...r }));
  }

  async timeline(tenantId: string, dedupKey: string): Promise<ProcessingRecord[]> {
    return this.records.filter((r) => r.tenantId === tenantId && r.dedupKey === dedupKey).map((r) => ({ ...r }));
  }

  async needingReview(tenantId?: string, relationshipId?: string): Promise<ProcessingRecord[]> {
    // Open items only: flagged for review AND not yet resolved.
    return (await this.list({ tenantId, relationshipId, needsReview: true })).filter((r) => !r.resolvedAt);
  }

  async resolve(id: string, patch: ResolutionPatch): Promise<ProcessingRecord> {
    const rec = this.records.find((x) => x.id === id);
    if (!rec) throw new Error(`processing event ${id} not found`);
    Object.assign(rec, patch);
    return { ...rec };
  }
}
