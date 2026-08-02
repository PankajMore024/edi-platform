import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CanonicalDocument } from '../canonical/types/document.types';

/** Everything needed to persist one processed transaction (the canonical doc + lifecycle metadata). */
export interface SaveTransaction {
  tenantId: string;
  relationshipId?: string;
  interchangeId?: string;
  direction: string;
  docType: string;
  transactionControlNumber: string;
  functionalGroupControlNumber: string;
  doc: CanonicalDocument;
  currentState: string;
  conformant: boolean;
  reason?: string;
  receivedAt: string;
  validatedAt?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
}

export interface StoredTransaction {
  id: string;
  tenantId: string;
  docType: string;
  direction: string;
  poNumber?: string;
  currentState: string;
  conformant: boolean;
  transactionControlNumber: string;
  functionalGroupControlNumber: string;
  /** The canonical document, reconstructed from the normalized rows (DB) or kept as-is (in-memory). */
  canonical: CanonicalDocument;
}

export interface TransactionSummary { id: string; docType: string; poNumber?: string; currentState: string; conformant: boolean; }

/**
 * Persists a processed transaction. The durable implementation shreds the canonical document into
 * normalized rows (class-table inheritance) and reconstructs it on read; the in-memory implementation
 * keeps the doc as-is for unit tests. Both target the same contract.
 */
export abstract class TransactionStore {
  abstract save(p: SaveTransaction): Promise<string>;
  abstract get(tenantId: string, id: string): Promise<StoredTransaction | undefined>;
  abstract list(tenantId: string, filter?: { docType?: string; state?: string }): Promise<TransactionSummary[]>;
}

@Injectable()
export class InMemoryTransactionStore extends TransactionStore {
  private readonly txns = new Map<string, StoredTransaction & { order: number }>();
  private seq = 0;

  async save(p: SaveTransaction): Promise<string> {
    const id = randomUUID();
    const d = p.doc as Record<string, any>;
    this.seq += 1;
    this.txns.set(id, {
      id, tenantId: p.tenantId, docType: p.docType, direction: p.direction,
      poNumber: d.poNumber ?? d.orders?.[0]?.poNumber, currentState: p.currentState, conformant: p.conformant,
      transactionControlNumber: p.transactionControlNumber, functionalGroupControlNumber: p.functionalGroupControlNumber,
      canonical: p.doc, order: this.seq,
    });
    return id;
  }

  async get(tenantId: string, id: string): Promise<StoredTransaction | undefined> {
    const t = this.txns.get(id);
    return t && t.tenantId === tenantId ? { ...t } : undefined;
  }

  async list(tenantId: string, filter: { docType?: string; state?: string } = {}): Promise<TransactionSummary[]> {
    return [...this.txns.values()]
      .filter((t) => t.tenantId === tenantId)
      .filter((t) => (filter.docType === undefined || t.docType === filter.docType))
      .filter((t) => (filter.state === undefined || t.currentState === filter.state))
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ id: t.id, docType: t.docType, poNumber: t.poNumber, currentState: t.currentState, conformant: t.conformant }));
  }
}
