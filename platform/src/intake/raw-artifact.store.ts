import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { RawArtifact } from './intake.types';

/**
 * Immutable, content-addressed store for raw inbound artifacts. Identity is the sha256 of the bytes,
 * so identical content is stored once and can never be silently overwritten with different content.
 * There is deliberately NO update/delete — retention is append-only for audit/reprocessing.
 *
 * In-memory M1 implementation; a disk/S3/DB impl swaps in behind this abstract class (same contract:
 * content-addressed, first-write-wins on receivedAt/source).
 */
export abstract class RawArtifactStore {
  abstract put(source: string, bytes: string, receivedAt: Date): RawArtifact;
  abstract get(id: string): RawArtifact | undefined;
}

export const sha256Hex = (bytes: string): string =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');

@Injectable()
export class InMemoryRawArtifactStore extends RawArtifactStore {
  private readonly blobs = new Map<string, RawArtifact>();

  put(source: string, bytes: string, receivedAt: Date): RawArtifact {
    const id = sha256Hex(bytes);
    // Content-addressed + immutable: the first receipt of a given content wins. A later receipt of
    // the SAME bytes returns the original record verbatim (it is, by definition, identical content).
    const existing = this.blobs.get(id);
    if (existing) return existing;

    const artifact: RawArtifact = {
      id,
      source,
      bytes,
      size: Buffer.byteLength(bytes, 'utf8'),
      receivedAt: receivedAt.toISOString(),
    };
    this.blobs.set(id, artifact);
    return artifact;
  }

  get(id: string): RawArtifact | undefined {
    return this.blobs.get(id);
  }
}
