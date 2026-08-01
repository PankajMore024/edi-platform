import { Injectable } from '@nestjs/common';
import { InboundGateway } from '../intake/inbound-gateway';
import { IntakeReceipt } from '../intake/intake.types';
import { ProcessingLedger, ProcessingOutcome, ProcessingRecord } from '../intake/processing-ledger';
import { X12Service, RawSegment } from '../x12/x12.service';
import { EnvelopeService, ControlNumbers } from '../envelope/envelope.service';
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
}

export interface InboundResult {
  outcome: InboundOutcome;
  receipt: IntakeReceipt;
  docType?: string;
  /** Native payload delivered into the customer system (only when accepted). */
  delivered?: unknown;
  validation?: ConformanceResult;
  /** The generated 997 (accepted/rejected outcomes). Dispatch to the partner is the live-transport step. */
  ack?: InboundAck;
  /** The lifecycle event written for this receipt — every outcome produces exactly one. */
  event: ProcessingRecord;
}

/**
 * The inbound receive backbone: one orchestrated path from raw partner bytes to a delivered document
 * + a 997 acknowledgment. It composes already-hardened pieces — intake (retain + dedup), the
 * translation pipeline (parse + translate + validate), the customer connector (deliver), and the ack
 * generator — and enforces the safety gates between them:
 *
 *   retain+dedup → duplicate? skip · conflict? quarantine
 *                → parse envelope → translate + validate
 *                → conformant? deliver to customer : DO NOT deliver
 *                → generate 997 (A / R with AK3/AK4) → [dispatch via transport = live step]
 *
 * A non-conformant document is never pushed into the customer system — it is rejected via the 997.
 * Actually sending the 997 back to the partner is the deferred live-transport step; this returns it.
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
  ) {}

  async receive(rel: TradingRelationship, source: string, bytes: string, receivedAt: Date): Promise<InboundResult> {
    // 1. Retain immutably + dedup on interchange identity, before anything else touches the bytes.
    const receipt = this.gateway.receive(source, bytes, receivedAt);

    // Duplicate / conflict short-circuit — but ALWAYS record the event so the lifecycle is auditable
    // and conflicts land in the review queue (the retained bytes of both versions are kept by the
    // artifact store; the event links this artifact to the original via firstArtifactId).
    if (receipt.status === 'duplicate') {
      const outcome: InboundOutcome = receipt.conflict ? 'conflict' : 'duplicate';
      const event = this.log(rel, receipt, outcome, {
        delivered: false,
        needsReview: receipt.conflict,
        note: receipt.conflict
          ? 'same interchange control number as an earlier document but different content — quarantined for review'
          : 'exact resend of an already-processed interchange — skipped (idempotent)',
      });
      return { outcome, receipt, event };
    }

    // 2. Parse the envelope once for the ack identifiers (GS/ST control numbers, functional id).
    const segments = this.x12.parse(bytes);
    const parsed = this.envelope.parseInterchange(segments);

    // 3. Translate + validate against the governing spec (authority decides accountability).
    const ingest = this.pipeline.ingestDocument(rel, segments);
    const conformant = ingest.validation.valid;

    // 4. Deliver to the customer ONLY when conformant — never push a bad doc downstream.
    let delivered: unknown;
    if (conformant) {
      delivered = await this.orchestrator.deliverDoc(rel, ingest.docType as DocType, ingest.doc);
    }

    // 5. Acknowledge the group (997), reflecting per-transaction-set conformance + detail.
    const ackResult = this.buildAck(rel, parsed, ingest.validation, receivedAt);
    const outcome: InboundOutcome = conformant ? 'accepted' : 'rejected';

    // 6. Record the lifecycle event. A rejected doc needs human attention (it wasn't delivered).
    const event = this.log(rel, receipt, outcome, {
      docType: ingest.docType,
      valid: ingest.validation.valid,
      errorCount: ingest.validation.errors.length,
      delivered: conformant,
      ackControlNumber: ackResult.control.isa13,
      needsReview: !conformant,
    });

    return { outcome, receipt, docType: ingest.docType, delivered, validation: ingest.validation, ack: ackResult, event };
  }

  /** Write one lifecycle event, carrying the dedup/conflict linkage from the intake receipt. */
  private log(
    rel: TradingRelationship,
    receipt: IntakeReceipt,
    outcome: InboundOutcome,
    detail: Partial<Omit<ProcessingRecord, 'id' | 'tenantId' | 'relationshipId' | 'outcome' | 'source' | 'receivedAt' | 'artifactId' | 'dedupKey' | 'occurrence' | 'firstArtifactId' | 'firstSeenAt'>> & { delivered: boolean; needsReview: boolean },
  ): ProcessingRecord {
    return this.ledger.record({
      tenantId: rel.tenantId,
      relationshipId: rel.id,
      outcome,
      source: receipt.artifact.source,
      receivedAt: receipt.artifact.receivedAt,
      artifactId: receipt.artifact.id,
      dedupKey: receipt.dedupKey,
      occurrence: receipt.occurrence,
      firstArtifactId: receipt.firstArtifactId,
      firstSeenAt: receipt.firstSeenAt,
      ...detail,
    });
  }

  private buildAck(
    rel: TradingRelationship,
    parsed: ReturnType<EnvelopeService['parseInterchange']>,
    validation: ConformanceResult,
    timestamp: Date,
  ): InboundAck {
    const body = this.ack.buildBody({
      functionalIdCode: parsed.functionalId ?? '',
      groupControlNumber: parsed.control.gs06,
      transactionSets: [
        {
          code: parsed.transactionSetCode ?? '',
          controlNumber: parsed.control.st02,
          accepted: validation.valid,
          errors: this.toAckErrors(validation.issues),
        },
      ],
    });

    // The 997 is outbound from us to the partner — same envelope identity + control-number sequence
    // as any other outbound interchange to this relationship.
    const control: ControlNumbers = {
      isa13: this.controlNumbers.nextPadded(`${rel.id}:isa`, 9),
      gs06: this.controlNumbers.next(`${rel.id}:gs`),
      st02: this.controlNumbers.nextPadded(`${rel.id}:st`, 4),
    };
    const segments = this.envelope.buildInterchange(body, {
      config: rel.envelope,
      control,
      functionalId: 'FA', // 997 lives in the FA functional group
      transactionSetCode: '997',
      timestamp,
      ackRequested: false,
    });

    return { segments, edi: this.x12.serialize(segments), control };
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
