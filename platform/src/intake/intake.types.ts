/**
 * Inbound intake lifecycle types. The intake layer is the trust boundary in front of processing:
 * every inbound artifact is retained immutably and deduplicated BEFORE the engine ever sees it, so
 * the same interchange can never be processed twice (no double-orders / double-invoices).
 */

/** An immutable, content-addressed copy of exactly what was received. */
export interface RawArtifact {
  /** sha256 hex of `bytes` — the content address and immutable identity. */
  id: string;
  /** Provenance, e.g. 'sftp:partnerX', 'webhook:shopify', 'manual-upload'. */
  source: string;
  /** The exact payload as received — never trimmed, normalized, or mutated. */
  bytes: string;
  /** Byte length of `bytes`. */
  size: number;
  /** ISO-8601 timestamp of the FIRST receipt of this content. */
  receivedAt: string;
}

/**
 * - `accepted`  — first time this interchange identity is seen; caller should process it.
 * - `duplicate` — already seen; caller must NOT reprocess (idempotency). Still retained + logged.
 */
export type IntakeStatus = 'accepted' | 'duplicate';

/** The verdict for one receipt event. Retention always happens; only processing is gated. */
export interface IntakeReceipt {
  artifact: RawArtifact;
  status: IntakeStatus;
  /** Logical interchange key (sender+receiver+ICN) or `sha256:<hash>` when the envelope is unparseable. */
  dedupKey: string;
  /** ISO timestamp when this dedupKey was first accepted. */
  firstSeenAt: string;
  /** 1 for the first occurrence, 2+ for repeats. */
  occurrence: number;
  /**
   * True ONLY when a duplicate carries DIFFERENT bytes than the first occurrence of the same
   * interchange identity (e.g. partner reused an ICN for a new payload, or a tampered replay).
   * This is NOT a benign duplicate — the caller must quarantine for human review, never silently skip.
   */
  conflict: boolean;
}
