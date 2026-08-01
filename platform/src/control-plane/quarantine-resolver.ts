import { Injectable } from '@nestjs/common';
import { ProcessingLedger, ProcessingRecord } from '../intake/processing-ledger';
import { RawArtifactStore } from '../intake/raw-artifact.store';
import { InboundPipeline, InboundResult } from './inbound-pipeline';
import { TradingRelationship } from './config.types';

export interface ResolutionResult {
  /** The review event, now stamped with the operator's resolution. */
  resolution: ProcessingRecord;
  /** For a reprocess: the new processing outcome produced by re-running the artifact. */
  result?: InboundResult;
}

/**
 * Operator actions on the review queue (conflicts + rejects). Closes the human loop on the document
 * lifecycle: nothing sits quarantined forever, and every action is itself audited on the ledger.
 *
 * - `queue`     — the open items awaiting attention.
 * - `dismiss`   — close an item WITHOUT processing (a conflict judged a partner error we won't act
 *   on; a reject we're waiving). No document is delivered.
 * - `reprocess` — re-run the retained bytes through the pipeline (bypassing dedup) and, if now
 *   conformant, deliver + acknowledge. Stamps the review event and links it to the new outcome.
 */
@Injectable()
export class QuarantineResolver {
  constructor(
    private readonly ledger: ProcessingLedger,
    private readonly artifacts: RawArtifactStore,
    private readonly pipeline: InboundPipeline,
  ) {}

  queue(tenantId?: string): ProcessingRecord[] {
    return this.ledger.needingReview(tenantId);
  }

  dismiss(eventId: string, resolvedBy: string, note: string, at: Date): ResolutionResult {
    this.requireOpen(eventId);
    const resolution = this.ledger.resolve(eventId, {
      resolution: 'dismissed', resolvedBy, resolutionNote: note, resolvedAt: at.toISOString(),
    });
    return { resolution };
  }

  async reprocess(rel: TradingRelationship, eventId: string, resolvedBy: string, note: string, at: Date): Promise<ResolutionResult> {
    const event = this.requireOpen(eventId);
    if (event.relationshipId !== rel.id) {
      throw new Error(`event ${eventId} belongs to relationship ${event.relationshipId}, not ${rel.id}`);
    }
    const artifact = this.artifacts.get(event.artifactId);
    if (!artifact) throw new Error(`cannot reprocess ${eventId}: raw artifact ${event.artifactId} not found`);

    const result = await this.pipeline.reprocess(rel, artifact, event, at);
    // Link the review event to the new processing event this reprocess produced (the matching set
    // for a per-TS reprocess; the first set for a whole-interchange conflict reprocess).
    const resolution = this.ledger.resolve(eventId, {
      resolution: 'reprocessed', resolvedBy, resolutionNote: note, resolvedAt: at.toISOString(),
      resolutionEventId: result.transactions[0]?.event.id,
    });
    return { resolution, result };
  }

  private requireOpen(eventId: string): ProcessingRecord {
    const event = this.ledger.get(eventId);
    if (!event) throw new Error(`review event ${eventId} not found`);
    if (!event.needsReview) throw new Error(`event ${eventId} is not in the review queue`);
    if (event.resolvedAt) throw new Error(`event ${eventId} was already resolved (${event.resolution})`);
    return event;
  }
}
