import { Injectable } from '@nestjs/common';
import { TransportRegistry } from '../transport-registry';
import { TransportAdapter, TransportDescriptor, TransportInstance, TransportPayload, TransportNotConfiguredError } from '../transport.types';

/** Webhook endpoint config. The signing secret lives in the vault via `vaultRef`. */
export interface WebhookSettings {
  /** Outbound: the partner URL we POST to. */
  url?: string;
  /** Inbound: signature scheme to verify deliveries (e.g. 'hmac-sha256'). */
  signatureScheme?: string;
  /** Inbound: header carrying the signature (e.g. 'X-Hub-Signature-256'). */
  signatureHeader?: string;
}

/** A raw inbound HTTP delivery handed to the webhook transport by the HTTP layer. */
export interface WebhookDelivery {
  body: string | Buffer;
  headers: Record<string, string>;
  deliveryId?: string;
}

/**
 * Webhook transport — push-based. Inbound data is delivered TO us over HTTP (so `pull` is invalid);
 * outbound is an HTTP POST to the partner URL. STUB: `push` (outbound POST) and signature
 * verification need live network + vault secrets we can't exercise here. `receive` (the real,
 * testable part) shapes an inbound HTTP delivery into a TransportPayload, and REFUSES to accept a
 * delivery when a signature scheme is configured but no signature is present — an unverified webhook
 * must never be trusted as a source of financial documents.
 */
@Injectable()
export class WebhookTransport implements TransportAdapter {
  readonly type = 'webhook';

  constructor(registry: TransportRegistry) {
    registry.register(this);
  }

  descriptor(): TransportDescriptor {
    return { id: 'webhook', kind: 'transport', name: 'Webhook (HTTP)', description: 'Receive pushed HTTP deliveries; POST outbound', mode: 'push' };
  }

  /** Webhooks are push-based: inbound arrives via `receive`, it is not fetched. */
  async pull(_instance: TransportInstance): Promise<TransportPayload[]> {
    throw new TransportNotConfiguredError('webhook', 'inbound is push-based — deliveries arrive via receive(), not pull()');
  }

  async push(_payload: TransportPayload, instance: TransportInstance): Promise<void> {
    const s = (instance.settings ?? {}) as unknown as WebhookSettings;
    if (!s.url) throw new Error('webhook transport misconfigured: missing outbound url');
    throw new TransportNotConfiguredError('webhook', 'live outbound POST needs network + vault secret (deferred to a credentialed environment)');
  }

  /**
   * Shape an inbound HTTP delivery into a TransportPayload. When a signature scheme is configured, a
   * signature header MUST be present or the delivery is rejected (actual HMAC verification against the
   * vault secret is deferred — but a missing signature is caught here, loudly).
   */
  receive(delivery: WebhookDelivery, instance: TransportInstance): TransportPayload {
    const s = (instance.settings ?? {}) as unknown as WebhookSettings;
    if (s.signatureScheme) {
      const header = s.signatureHeader ?? 'X-Signature';
      const sig = delivery.headers[header] ?? delivery.headers[header.toLowerCase()];
      if (!sig) throw new Error(`webhook delivery rejected: ${s.signatureScheme} required but signature header "${header}" is absent`);
      if (!instance.vaultRef) throw new Error('webhook transport misconfigured: signatureScheme set but no vaultRef for the signing secret');
    }
    return { bytes: delivery.body, source: `webhook:${instance.transportType}:${delivery.deliveryId ?? 'unknown'}` };
  }
}
