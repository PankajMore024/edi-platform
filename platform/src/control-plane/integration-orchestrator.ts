import { Injectable } from '@nestjs/common';
import { ConnectorRegistry } from '../connectors/connector-registry';
import { TranslationPipeline, EmitResult } from './translation-pipeline';
import { ConnectorInstanceStore } from './connector-instance-store';
import { DocType, RelationshipDocument, TradingRelationship } from './config.types';
import { ConformanceResult } from '../validation/conformance-validator';
import { CanonicalDocument } from '../canonical/types/document.types';

export interface DeliverResult {
  docType: string;
  native: unknown; // CSV string / JSON object for the customer system
  validation: ConformanceResult;
}

/**
 * Full end-to-end orchestration: composes the customer edge (connectors) with the partner edge
 * (TranslationPipeline) at the canonical boundary. This is the top of the control plane —
 * it turns a customer payload into a partner interchange and vice versa, driven entirely by a
 * TradingRelationship. Depends only on the ConnectorRegistry interface, never a concrete connector.
 */
@Injectable()
export class IntegrationOrchestrator {
  constructor(
    private readonly pipeline: TranslationPipeline,
    private readonly connectors: ConnectorRegistry,
    private readonly instances: ConnectorInstanceStore,
  ) {}

  /** Customer → Partner: a native payload (file/API) → validated X12 interchange(s). */
  async receiveFromCustomer(rel: TradingRelationship, docType: DocType, raw: unknown, timestamp: Date): Promise<EmitResult[]> {
    const rd = this.findDoc(rel, docType, 'outbound');
    const instance = this.instances.get(this.requireConnector(rd));
    const connector = this.connectors.get(instance.connectorType);
    const docs = await connector.ingest(raw, instance);
    return Promise.all(docs.map((doc) => this.pipeline.emitDocument(rel, docType, doc, timestamp)));
  }

  /** Partner → Customer: an X12 interchange → native payload delivered into the customer system. */
  async deliverToCustomer(rel: TradingRelationship, interchange: Parameters<TranslationPipeline['ingestDocument']>[1]): Promise<DeliverResult> {
    const res = this.pipeline.ingestDocument(rel, interchange);
    const native = await this.deliverDoc(rel, res.docType as DocType, res.doc);
    return { docType: res.docType, native, validation: res.validation };
  }

  /**
   * Deliver an ALREADY-translated canonical document to the customer's connector. Split out so the
   * inbound pipeline can gate delivery on validation (never push a non-conformant doc into the
   * customer system) without re-translating.
   */
  async deliverDoc(rel: TradingRelationship, docType: DocType, doc: CanonicalDocument): Promise<unknown> {
    const rd = this.findDoc(rel, docType, 'inbound');
    const instance = this.instances.get(this.requireConnector(rd));
    const connector = this.connectors.get(instance.connectorType);
    return connector.emitData(doc, instance);
  }

  private requireConnector(rd: RelationshipDocument): string {
    if (!rd.connectorInstanceId) {
      throw new Error(`relationship doc ${rd.docType}/${rd.direction} has no connectorInstanceId`);
    }
    return rd.connectorInstanceId;
  }

  private findDoc(rel: TradingRelationship, docType: DocType, direction: 'outbound' | 'inbound'): RelationshipDocument {
    const rd = rel.documents.find((d) => d.docType === docType && d.direction === direction && d.enabled);
    if (!rd) throw new Error(`relationship ${rel.id} has no enabled ${direction} config for ${docType}`);
    return rd;
  }
}
