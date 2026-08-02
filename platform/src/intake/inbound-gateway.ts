import { Injectable } from '@nestjs/common';
import { X12Service } from '../x12/x12.service';
import { RawArtifactStore, sha256Hex } from './raw-artifact.store';
import { DedupStore } from './dedup.store';
import { IntakeReceipt } from './intake.types';

/**
 * The inbound trust boundary. Every raw payload — from any transport (SFTP, webhook, upload) — enters
 * here first. Responsibilities, in order:
 *   1. Retain the raw bytes immutably BEFORE any parsing (a malformed payload must still be kept).
 *   2. Derive the interchange identity and atomically dedup against everything seen before.
 *   3. Return a receipt telling the caller whether to process (accepted) or skip (duplicate),
 *      and flag same-identity/different-bytes conflicts for human review.
 *
 * It does NOT translate or validate — that is the pipeline's job downstream of an `accepted` receipt.
 */
@Injectable()
export class InboundGateway {
  constructor(
    private readonly raw: RawArtifactStore,
    private readonly dedup: DedupStore,
    private readonly x12: X12Service,
  ) {}

  async receive(tenantId: string, source: string, bytes: string, receivedAt: Date): Promise<IntakeReceipt> {
    // 1. Retain first — if identity derivation or anything downstream throws, the raw is safe.
    const artifact = await this.raw.put(tenantId, source, bytes, receivedAt);

    // 2. Derive the interchange identity (dedup key) + a normalized-content fingerprint.
    const { key, fingerprint } = this.identify(bytes, artifact.id);

    // 3. Atomic check-and-record on the identity.
    const record = await this.dedup.register(tenantId, key, artifact.id, fingerprint, receivedAt);

    const status = record.occurrences === 1 ? 'accepted' : 'duplicate';
    // Same interchange identity but different NORMALIZED content = NOT a benign resend. Surface it.
    // (Byte-only differences like line endings normalize away and do NOT trip this.)
    const conflict = status === 'duplicate' && record.firstFingerprint !== fingerprint;

    return {
      artifact,
      status,
      dedupKey: key,
      firstArtifactId: record.firstArtifactId,
      firstSeenAt: record.firstSeenAt,
      occurrence: record.occurrences,
      conflict,
    };
  }

  /**
   * Derive the idempotency key and the content fingerprint from a payload.
   *
   * - `key`: the X12 interchange identity (sender + receiver + interchange control number,
   *   ISA05–08 + ISA13) — robust to byte-level differences on a genuine resend. When the payload is
   *   not parseable X12 (e.g. a connector JSON payload, or corruption), fall back to the exact
   *   content hash so exact-duplicates are still caught.
   * - `fingerprint`: a hash of the NORMALIZED interchange (segments re-serialized), so whitespace /
   *   line-ending differences collapse but a changed business value does not. Used only to tell a
   *   benign resend apart from a same-identity/different-content conflict. For the content-hash
   *   fallback, key already implies identical bytes, so the fingerprint is the same hash.
   */
  private identify(bytes: string, contentHash: string): { key: string; fingerprint: string } {
    let segments;
    try {
      segments = this.x12.parse(bytes);
    } catch {
      segments = undefined;
    }
    const isa = segments?.find((s) => s.tag === 'ISA');
    if (segments && isa && isa.elements.length >= 13) {
      const senderQual = (isa.elements[4] ?? '').trim();
      const senderId = (isa.elements[5] ?? '').trim();
      const receiverQual = (isa.elements[6] ?? '').trim();
      const receiverId = (isa.elements[7] ?? '').trim();
      const icn = (isa.elements[12] ?? '').trim();
      if (senderId && receiverId && icn) {
        return {
          key: `x12:${senderQual}:${senderId}>${receiverQual}:${receiverId}#${icn}`,
          fingerprint: sha256Hex(this.x12.serialize(segments)),
        };
      }
    }
    return { key: `sha256:${contentHash}`, fingerprint: contentHash };
  }
}
