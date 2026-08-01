import { Injectable } from '@nestjs/common';

/** What the dedup store remembers about one interchange identity. */
export interface DedupRecord {
  key: string;
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
 * MUST return the state AFTER counting this occurrence, so the caller can decide accept-vs-duplicate
 * without a separate read (a check-then-set gap would allow the same interchange to be processed
 * twice under concurrency). A DB impl backs this with an upsert / unique constraint.
 */
export abstract class DedupStore {
  abstract register(key: string, fingerprint: string, at: Date): DedupRecord;
  abstract lookup(key: string): DedupRecord | undefined;
}

@Injectable()
export class InMemoryDedupStore extends DedupStore {
  private readonly records = new Map<string, DedupRecord>();

  register(key: string, fingerprint: string, at: Date): DedupRecord {
    const existing = this.records.get(key);
    if (existing) {
      existing.occurrences += 1;
      return { ...existing };
    }
    const record: DedupRecord = {
      key,
      firstFingerprint: fingerprint,
      firstSeenAt: at.toISOString(),
      occurrences: 1,
    };
    this.records.set(key, record);
    return { ...record };
  }

  lookup(key: string): DedupRecord | undefined {
    const r = this.records.get(key);
    return r ? { ...r } : undefined;
  }
}
