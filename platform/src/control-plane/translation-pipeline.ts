import { Injectable } from '@nestjs/common';
import { EmitService } from '../mapping/engine/emit.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EnvelopeService, ControlNumbers } from '../envelope/envelope.service';
import { ControlNumberService } from '../envelope/control-number.service';
import { ConformanceValidator, ConformanceResult } from '../validation/conformance-validator';
import { CanonicalDocument } from '../canonical/types/document.types';
import { RawSegment } from '../x12/x12.service';
import { DocType, RelationshipDocument, TradingRelationship } from './config.types';
import { MapRegistry } from './map-registry';
import { SpecRegistry } from './spec-registry';

export interface EmitResult {
  interchange: RawSegment[];
  validation: ConformanceResult;
  control: ControlNumbers;
}

export interface IngestResult {
  docType: string;
  doc: CanonicalDocument;
  validation: ConformanceResult;
}

/**
 * The control plane's composition service: given a TradingRelationship + a document, it SELECTS the
 * map + spec from config, runs the pure engine, validates per format_authority, and wraps the
 * envelope + control numbers. This is the ONLY place that knows about relationships — the engine,
 * validator, and envelope stay pure and config-blind. It composes already-hardened cores.
 */
@Injectable()
export class TranslationPipeline {
  constructor(
    private readonly emitSvc: EmitService,
    private readonly ingestSvc: IngestService,
    private readonly envelope: EnvelopeService,
    private readonly controlNumbers: ControlNumberService,
    private readonly validator: ConformanceValidator,
    private readonly maps: MapRegistry,
    private readonly specs: SpecRegistry,
  ) {}

  /** Outbound: canonical document → full validated X12 interchange, driven by the relationship. */
  emitDocument(rel: TradingRelationship, docType: DocType, doc: CanonicalDocument, timestamp: Date): EmitResult {
    const rd = this.findDoc(rel, docType, 'outbound');
    const map = this.maps.get(rd.mapId);

    const body = this.emitSvc.emit(doc, map);
    const validation = this.validateBody(body, rd);

    const control: ControlNumbers = {
      isa13: this.controlNumbers.nextPadded(`${rel.id}:isa`, 9),
      gs06: this.controlNumbers.next(`${rel.id}:gs`),
      st02: this.controlNumbers.nextPadded(`${rel.id}:st`, 4),
    };

    const interchange = this.envelope.buildInterchange(body, {
      config: rel.envelope,
      control,
      functionalId: map.functionalId ?? '',
      transactionSetCode: docType,
      timestamp,
      ackRequested: false,
    });

    return { interchange, validation, control };
  }

  /** Inbound: a full X12 interchange → canonical document, validated per authority. */
  ingestDocument(rel: TradingRelationship, interchange: RawSegment[]): IngestResult {
    const parsed = this.envelope.parseInterchange(interchange);
    const docType = (parsed.transactionSetCode ?? '') as DocType;
    const rd = this.findDoc(rel, docType, 'inbound');
    const map = this.maps.get(rd.mapId);

    const doc = this.ingestSvc.ingest(parsed.body, map);
    const validation = this.validateBody(parsed.body, rd);

    return { docType, doc, validation };
  }

  /** Validate the body against the governing spec (if configured). Authority decides accountability. */
  private validateBody(body: RawSegment[], rd: RelationshipDocument): ConformanceResult {
    if (!rd.specId) return { valid: true, errors: [], issues: [] };
    return this.validator.validate(body, this.specs.get(rd.specId));
  }

  private findDoc(rel: TradingRelationship, docType: DocType, direction: 'outbound' | 'inbound'): RelationshipDocument {
    const rd = rel.documents.find((d) => d.docType === docType && d.direction === direction && d.enabled);
    if (!rd) {
      throw new Error(`relationship ${rel.id} has no enabled ${direction} config for ${docType}`);
    }
    return rd;
  }
}
