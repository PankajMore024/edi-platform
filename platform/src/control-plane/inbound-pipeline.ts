import { Injectable } from '@nestjs/common';
import { InboundGateway } from '../intake/inbound-gateway';
import { IntakeReceipt, RawArtifact } from '../intake/intake.types';
import { ProcessingLedger, ProcessingOutcome, ProcessingRecord } from '../intake/processing-ledger';
import { TransactionStore } from '../intake/transaction-store';
import { CanonicalDocument } from '../canonical/types/document.types';
import { X12Service, RawSegment } from '../x12/x12.service';
import { EnvelopeService, ControlNumbers, ParsedGroup, ParsedTransactionSet } from '../envelope/envelope.service';
import { ControlNumberService } from '../envelope/control-number.service';
import { FunctionalAckService, TransactionSetError } from '../ack/functional-ack.service';
import { ConformanceResult, ConformanceIssue } from '../validation/conformance-validator';
import { TranslationPipeline } from './translation-pipeline';
import { IntegrationOrchestrator } from './integration-orchestrator';
import { DocType, TradingRelationship } from './config.types';

/** Re-exported so callers can name outcomes without reaching into the intake layer. */
export type InboundOutcome = ProcessingOutcome;

export interface InboundAck {
  segments: RawSegment[];
  edi: string;
  control: ControlNumbers;
  /** The functional group this 997 acknowledges (GS06 of the received group). */
  groupControlNumber: string;
}

/** The outcome of one transaction set within a (possibly batched) interchange. */
export interface TransactionOutcome {
  functionalId: string;
  groupControlNumber: string;
  transactionSetCode: string;
  transactionControlNumber: string;
  conformant: boolean;
  delivered: boolean;
  /** Native payload delivered into the customer system (present only when delivered). */
  deliveredPayload?: unknown;
  validation: ConformanceResult;
  event: ProcessingRecord;
}

export interface InboundResult {
  /** Interchange-level summary: `accepted` iff every transaction set was conformant; otherwise
   * `rejected`. `duplicate`/`conflict` are set when intake short-circuits before any translation. */
  outcome: InboundOutcome;
  /** The intake receipt for a fresh receive; absent on a reprocess (no new intake happened). */
  receipt?: IntakeReceipt;
  /** Interchange-level lifecycle event, present only for the duplicate/conflict short-circuit. */
  event?: ProcessingRecord;
  /** Per-transaction-set outcomes (accepted/rejected paths). One entry per ST in the interchange. */
  transactions: TransactionOutcome[];
  /** One 997 per received functional group (each independently dispatchable). */
  acks: InboundAck[];
}

/** Everything processing needs about a payload, independent of fresh-receive vs reprocess. */
interface ProcessContext {
  bytes: string;
  source: string;
  receivedAt: string;
  artifactId: string;
  dedupKey: string;
  occurrence: number;
  firstArtifactId?: string;
  firstSeenAt?: string;
  /** id of the review event this run is a reprocess of (for the audit note). */
  reprocessOf?: string;
}

/**
 * The inbound receive backbone: one orchestrated path from raw partner bytes to delivered documents
 * + 997 acknowledgments. It composes already-hardened pieces — intake (retain + dedup), the
 * translation pipeline (parse + translate + validate), the customer connector (deliver), and the ack
 * generator — and enforces the safety gates between them:
 *
 *   retain+dedup → duplicate? skip · conflict? quarantine
 *                → parse groups → for EACH transaction set: translate + validate
 *                → conformant? deliver to customer : DO NOT deliver
 *                → one 997 per functional group (AK2/AK5 per set, AK3/AK4 detail)
 *                → [dispatch via transport = live step]
 *
 * Batched interchanges are handled: many transaction sets across many functional groups, each set
 * delivered/rejected independently and acknowledged in its group's 997. A non-conformant document is
 * never pushed into the customer system. Sending the 997s back is the deferred live-transport step.
 */
@Injectable()
export class InboundPipeline {
  constructor(
    private readonly gateway: InboundGateway,
    private readonly x12: X12Service,
    private readonly pipeline: TranslationPipeline,
    private readonly orchestrator: IntegrationOrchestrator,
    private readonly ack: FunctionalAckService,
    private readonly envelope: EnvelopeService,
    private readonly controlNumbers: ControlNumberService,
    private readonly ledger: ProcessingLedger,
    private readonly txnStore: TransactionStore,
  ) {}

  async receive(rel: TradingRelationship, source: string, bytes: string, receivedAt: Date): Promise<InboundResult> {
    // 1. Retain immutably + dedup on interchange identity, before anything else touches the bytes.
    const receipt = await this.gateway.receive(rel.tenantId, source, bytes, receivedAt);

    // Duplicate / conflict short-circuit — but ALWAYS record the event so the lifecycle is auditable
    // and conflicts land in the review queue (the retained bytes of both versions are kept; the event
    // links this artifact to the original via firstArtifactId).
    if (receipt.status === 'duplicate') {
      const outcome: InboundOutcome = receipt.conflict ? 'conflict' : 'duplicate';
      const event = await this.logEvent(rel, this.baseOf(receipt), outcome, {
        delivered: false,
        needsReview: receipt.conflict,
        note: receipt.conflict
          ? 'same interchange control number as an earlier document but different content — quarantined for review'
          : 'exact resend of an already-processed interchange — skipped (idempotent)',
      });
      return { outcome, receipt, event, transactions: [], acks: [] };
    }

    return { ...(await this.processInterchange(rel, this.baseOf(receipt), receivedAt)), receipt };
  }

  /**
   * Re-run a retained artifact, BYPASSING intake dedup — the quarantine resolver calls this when an
   * operator reprocesses a review item. If the review event names a specific transaction set (a
   * rejected set), only THAT set is re-run — its already-delivered siblings are never touched, so
   * there is no double-delivery. Otherwise (an interchange-level conflict) the whole interchange is
   * re-run (the operator is explicitly choosing to supersede with this version).
   */
  async reprocess(rel: TradingRelationship, artifact: RawArtifact, original: ProcessingRecord, at: Date): Promise<InboundResult> {
    const ctx: ProcessContext = {
      bytes: artifact.bytes, source: artifact.source, receivedAt: artifact.receivedAt, artifactId: artifact.id,
      dedupKey: original.dedupKey, occurrence: original.occurrence,
      firstArtifactId: original.firstArtifactId, firstSeenAt: original.firstSeenAt, reprocessOf: original.id,
    };

    if (original.docType && original.transactionControlNumber) {
      const located = this.locateTransaction(ctx.bytes, original.docType, original.transactionControlNumber);
      if (!located) {
        throw new Error(`reprocess: transaction ${original.docType}/${original.transactionControlNumber} not found in artifact ${artifact.id}`);
      }
      return this.processInterchange(rel, ctx, at, located);
    }
    return this.processInterchange(rel, ctx, at);
  }

  /**
   * Core: parse the interchange into groups/sets and process each set. When `only` is given, just that
   * one transaction set is processed (per-TS reprocess); otherwise all sets are processed.
   */
  private async processInterchange(
    rel: TradingRelationship,
    ctx: ProcessContext,
    timestamp: Date,
    only?: { group: ParsedGroup; ts: ParsedTransactionSet },
  ): Promise<InboundResult> {
    const parsed = this.envelope.parseGroups(this.x12.parse(ctx.bytes));
    const groups = only ? [{ ...only.group, transactionSets: [only.ts] }] : parsed.groups;

    const transactions: TransactionOutcome[] = [];
    const acks: InboundAck[] = [];

    for (const group of groups) {
      // Translate + validate + deliver each set first, then build the group's single 997.
      const processed = [] as Array<{ ts: ParsedTransactionSet; conformant: boolean; delivered: boolean; deliveredPayload?: unknown; validation: ConformanceResult; doc: CanonicalDocument }>;
      for (const ts of group.transactionSets) {
        const ingest = this.pipeline.ingestBody(rel, ts.transactionSetCode as DocType, ts.body);
        const conformant = ingest.validation.valid;
        let delivered = false;
        let deliveredPayload: unknown;
        if (conformant) {
          deliveredPayload = await this.orchestrator.deliverDoc(rel, ingest.docType as DocType, ingest.doc);
          delivered = true;
        }
        processed.push({ ts, conformant, delivered, deliveredPayload, validation: ingest.validation, doc: ingest.doc });
      }

      const ack = await this.buildGroupAck(rel, group, processed, timestamp);
      acks.push(ack);

      // Record one lifecycle event per transaction set, carrying its identity + this group's ack ref.
      for (const p of processed) {
        const outcome: InboundOutcome = p.conformant ? 'accepted' : 'rejected';
        // Persist the transaction itself (canonical → normalized rows) — a bad doc is stored too, in
        // REJECTED state, so it's queryable for review/debugging; it just wasn't delivered.
        const transactionId = await this.txnStore.save({
          tenantId: rel.tenantId, relationshipId: rel.id, direction: 'inbound',
          docType: p.ts.transactionSetCode, transactionControlNumber: p.ts.controlNumber,
          functionalGroupControlNumber: group.groupControlNumber, doc: p.doc,
          currentState: p.conformant ? 'DELIVERED' : 'REJECTED', conformant: p.conformant,
          reason: p.conformant ? undefined : p.validation.errors.join('; '),
          receivedAt: ctx.receivedAt, validatedAt: timestamp.toISOString(),
          deliveredAt: p.delivered ? timestamp.toISOString() : undefined,
          acknowledgedAt: timestamp.toISOString(),
        });
        const event = await this.logEvent(rel, ctx, outcome, {
          transactionId,
          docType: p.ts.transactionSetCode,
          functionalGroupControlNumber: group.groupControlNumber,
          transactionControlNumber: p.ts.controlNumber,
          valid: p.conformant,
          errorCount: p.validation.errors.length,
          delivered: p.delivered,
          ackControlNumber: ack.control.isa13,
          needsReview: !p.conformant,
          note: ctx.reprocessOf ? `reprocess of ${ctx.reprocessOf}` : undefined,
        });
        transactions.push({
          functionalId: group.functionalId,
          groupControlNumber: group.groupControlNumber,
          transactionSetCode: p.ts.transactionSetCode,
          transactionControlNumber: p.ts.controlNumber,
          conformant: p.conformant,
          delivered: p.delivered,
          deliveredPayload: p.deliveredPayload,
          validation: p.validation,
          event,
        });
      }
    }

    const outcome: InboundOutcome = transactions.every((t) => t.conformant) ? 'accepted' : 'rejected';
    return { outcome, transactions, acks };
  }

  /** Build one 997 for a functional group, with an AK2/AK5 (+AK3/AK4) per transaction set. */
  private async buildGroupAck(
    rel: TradingRelationship,
    group: ParsedGroup,
    processed: Array<{ ts: ParsedTransactionSet; conformant: boolean; validation: ConformanceResult }>,
    timestamp: Date,
  ): Promise<InboundAck> {
    const body = this.ack.buildBody({
      functionalIdCode: group.functionalId,
      groupControlNumber: group.groupControlNumber,
      transactionSets: processed.map((p) => ({
        code: p.ts.transactionSetCode,
        controlNumber: p.ts.controlNumber,
        accepted: p.conformant,
        errors: this.toAckErrors(p.validation.issues),
      })),
    });

    // The 997 is outbound from us to the partner — same envelope identity + control-number sequence
    // as any other outbound interchange to this relationship.
    const control: ControlNumbers = {
      isa13: await this.controlNumbers.nextPadded(rel.tenantId, `${rel.id}:isa`, 9),
      gs06: await this.controlNumbers.next(rel.tenantId, `${rel.id}:gs`),
      st02: await this.controlNumbers.nextPadded(rel.tenantId, `${rel.id}:st`, 4),
    };
    const segments = this.envelope.buildInterchange(body, {
      config: rel.envelope,
      control,
      functionalId: 'FA', // 997 lives in the FA functional group
      transactionSetCode: '997',
      timestamp,
      ackRequested: false,
    });

    return { segments, edi: this.x12.serialize(segments), control, groupControlNumber: group.groupControlNumber };
  }

  /** Find a specific transaction set (by code + control number) within the retained interchange. */
  private locateTransaction(bytes: string, code: string, controlNumber: string): { group: ParsedGroup; ts: ParsedTransactionSet } | undefined {
    const parsed = this.envelope.parseGroups(this.x12.parse(bytes));
    for (const group of parsed.groups) {
      const ts = group.transactionSets.find((t) => t.transactionSetCode === code && t.controlNumber === controlNumber);
      if (ts) return { group, ts };
    }
    return undefined;
  }

  /** The ledger base fields shared by every event, derived from an intake receipt. */
  private baseOf(receipt: IntakeReceipt): ProcessContext {
    return {
      bytes: receipt.artifact.bytes,
      source: receipt.artifact.source,
      receivedAt: receipt.artifact.receivedAt,
      artifactId: receipt.artifact.id,
      dedupKey: receipt.dedupKey,
      occurrence: receipt.occurrence,
      firstArtifactId: receipt.firstArtifactId,
      firstSeenAt: receipt.firstSeenAt,
    };
  }

  /** Write one lifecycle event, carrying the dedup/conflict linkage from the process context. */
  private logEvent(
    rel: TradingRelationship,
    ctx: ProcessContext,
    outcome: InboundOutcome,
    detail: Partial<Omit<ProcessingRecord, 'id' | 'tenantId' | 'relationshipId' | 'outcome' | 'source' | 'receivedAt' | 'artifactId' | 'dedupKey' | 'occurrence' | 'firstArtifactId' | 'firstSeenAt'>> & { delivered: boolean; needsReview: boolean },
  ): Promise<ProcessingRecord> {
    return this.ledger.record({
      tenantId: rel.tenantId,
      relationshipId: rel.id,
      outcome,
      source: ctx.source,
      receivedAt: ctx.receivedAt,
      artifactId: ctx.artifactId,
      dedupKey: ctx.dedupKey,
      occurrence: ctx.occurrence,
      firstArtifactId: ctx.firstArtifactId,
      firstSeenAt: ctx.firstSeenAt,
      ...detail,
    });
  }

  /** ConformanceIssue → TransactionSetError (1:1 field rename; keeps ack decoupled from validation). */
  private toAckErrors(issues: ConformanceIssue[]): TransactionSetError[] {
    return issues.map((i) => ({
      segmentTag: i.segmentTag,
      segmentPosition: i.segmentPosition,
      elementPosition: i.elementPosition,
      code: i.errorCode,
      badValue: i.badValue,
    }));
  }
}
