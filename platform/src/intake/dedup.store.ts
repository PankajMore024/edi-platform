import { Injectable } from '@nestjs/common';

/** What the dedup store remembers about one interchange identity. */
export interface DedupRecord {
  key: string;
  /** Raw artifact id (content hash) of the FIRST occurrence — lets a conflict/duplicate be traced
   * back to the original retained bytes for operator review. */
  firstArtifactId: string;
  /**
   * Normalized-content fingerprint of the FIRST occurrence. Comparing a later occurrence's
   * fingerprint against this detects same-identity/different-CONTENT conflicts, while ignoring
   * benign byte-level differences (line endings, whitespace) that normalize away.
   */
  firstFingerprint: string;
  /** ISO timestamp of the first occurrence. */
  firstSeenAt: string;
  /** How many times this key has been registered, including the first. */
  occurrences: number;
}

/**
 * Idempotency ledger for inbound interchanges. `register` is a single atomic check-and-record: it
 * returns the state AFTER counting this occurrence (a check-then-set gap would let the same
 * interchange process twice). Async + multi-tenant so a DB upsert impl can back it.
 */
export abstract class DedupStore {
  abstract register(tenantId: string, key: string, artifactId: string, fingerprint: string, at: Date): Promise<DedupRecord>;
  abstract lookup(tenantId: string, key: string): Promise<DedupRecord | undefined>;
}

@Injectable()
export class InMemoryDedupStore extends DedupStore {
  private readonly records = new Map<string, DedupRecord>();
  private key(tenantId: string, key: string): string { return `${tenantId} ${key}`; }

  async register(tenantId: string, key: string, artifactId: string, fingerprint: string, at: Date): Promise<DedupRecord> {
    const k = this.key(tenantId, key);
    const existing = this.records.get(k);
    if (existing) {
      existing.occurrences += 1;
      return { ...existing };
    }
    const record: DedupRecord = {
      key, firstArtifactId: artifactId, firstFingerprint: fingerprint, firstSeenAt: at.toISOString(), occurrences: 1,
    };
    this.records.set(k, record);
    return { ...record };
  }

  async lookup(tenantId: string, key: string): Promise<DedupRecord | undefined> {
    const r = this.records.get(this.key(tenantId, key));
    return r ? { ...r } : undefined;
  }
}
