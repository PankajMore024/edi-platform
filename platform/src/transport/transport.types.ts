/**
 * Transport layer — how bytes MOVE between us and a partner/customer endpoint. This is a distinct
 * axis from connectors (which translate bytes ↔ canonical): a running integration composes a
 * transport (e.g. SFTP) with a format connector (e.g. csv). Keeping them orthogonal avoids a
 * transport×format combinatorial explosion and mirrors how real iPaaS products are built.
 *
 * Transports deal in opaque bytes only; they never parse or translate.
 */

/** One payload moved by a transport, with enough provenance for the intake gateway. */
export interface TransportPayload {
  /** Opaque bytes exactly as received/to-send (text for CSV/X12, binary Buffer for xlsx). */
  bytes: string | Buffer;
  /** Where it came from (e.g. an SFTP path, a webhook delivery id) — becomes the artifact `source`. */
  source: string;
}

/** A configured transport endpoint for a tenant. Credentials resolve from the vault via `vaultRef`. */
export interface TransportInstance {
  id: string;
  tenantId: string;
  transportType: string;
  /** Endpoint config (host/port/path for SFTP; url for webhook). Non-secret; secrets via `vaultRef`. */
  settings: Record<string, unknown>;
  vaultRef?: string;
  direction: 'inbound' | 'outbound' | 'both';
}

/** Catalog entry for a transport, so the console can list it alongside connectors. */
export interface TransportDescriptor {
  id: string;
  kind: 'transport';
  name: string;
  description?: string;
  /** How inbound data arrives: `poll` (we fetch), `push` (partner delivers to us), or both. */
  mode: 'poll' | 'push' | 'poll+push';
}

/**
 * The uniform transport contract. Both directions are async (network/disk I/O).
 * - `pull`  — fetch pending inbound payloads (SFTP list+get, poll a queue). Push-only transports
 *   (webhook) throw, because inbound data is delivered TO us, not fetched.
 * - `push`  — deliver an outbound payload to the endpoint (SFTP put, HTTP POST).
 */
export interface TransportAdapter {
  readonly type: string;
  descriptor(): TransportDescriptor;
  pull(instance: TransportInstance): Promise<TransportPayload[]>;
  push(payload: TransportPayload, instance: TransportInstance): Promise<void>;
}

/** Thrown by a stub transport whose real implementation needs credentials/an SDK we can't run yet. */
export class TransportNotConfiguredError extends Error {
  constructor(transportType: string, detail: string) {
    super(`${transportType} transport is not live yet: ${detail}`);
    this.name = 'TransportNotConfiguredError';
  }
}
