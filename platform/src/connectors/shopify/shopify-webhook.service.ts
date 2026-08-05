import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ShopifyRegistrationRepository } from '../../db/repositories/shopify-registration.repository';
import { ProductCatalogRepository } from '../../db/repositories/product-catalog.repository';
import { RawArtifactRepository } from '../../db/repositories/raw-artifact.repository';
import { TransactionRepository } from '../../db/repositories/transaction.repository';
import { ProcessingRepository } from '../../db/repositories/processing.repository';
import { ControlNumberRepository } from '../../db/repositories/control-number.repository';
import { ShopifyIntake } from './shopify-intake';

export interface WebhookOutcome {
  status: 'processed' | 'skipped-test' | 'duplicate';
  routed?: number;
  held?: boolean;
  unmapped?: string[];
}

/**
 * Shopify webhook orchestration (Shopify §C): resolve the shop → tenant/secret/prefixes, verify the HMAC,
 * run intake (→ canonical → multi-vendor split), and persist durably + idempotently. On a clean split the
 * per-vendor orders are saved as outbound 850 transactions (visible per partner); a held order (unmapped
 * SKU) is NOT routed — it records a review-queue exception instead. Idempotent on the webhook id.
 *
 * NOT here (→ live/transport): the actual X12 envelope + dispatch to the vendor, and Admin API writes.
 */
@Injectable()
export class ShopifyWebhookService {
  private readonly intake = new ShopifyIntake();

  constructor(
    private readonly registrations: ShopifyRegistrationRepository,
    private readonly catalog: ProductCatalogRepository,
    private readonly raw: RawArtifactRepository,
    private readonly txns: TransactionRepository,
    private readonly ledger: ProcessingRepository,
    private readonly controlNumbers: ControlNumberRepository,
  ) {}

  async process(rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookOutcome> {
    const shop = headers['x-shopify-shop-domain'] ?? headers['X-Shopify-Shop-Domain'];
    if (!shop) throw new BadRequestException('missing X-Shopify-Shop-Domain');
    const reg = await this.registrations.getByShop(shop);
    if (!reg) throw new NotFoundException(`no Shopify registration for shop ${shop}`);

    const resolver = await this.catalog.buildResolver(reg.tenantId, reg.prefixes);
    const result = this.intake.ingest(rawBody, headers, reg.secret, resolver); // throws ShopifyHmacError on bad sig
    if (result.skipped === 'test') return { status: 'skipped-test' };

    // idempotency: Shopify re-delivers — a webhook id we've seen is a no-op
    if ((await this.ledger.timeline(reg.tenantId, result.idempotencyKey)).length) return { status: 'duplicate' };

    const now = new Date();
    const artifact = await this.raw.put(reg.tenantId, `shopify:${shop}`, rawBody, now);
    const unmapped = (result.unmapped ?? []).map((u) => u.sku ?? '(no sku)');

    if (!result.held) {
      for (const ro of result.routed ?? []) {
        const ctrl = await this.controlNumbers.next(reg.tenantId, `shopify-out:${ro.vendorId}`);
        await this.txns.save({
          tenantId: reg.tenantId, relationshipId: ro.vendorId, direction: 'outbound', docType: '850',
          transactionControlNumber: ctrl, functionalGroupControlNumber: ctrl,
          currentState: 'ROUTED', conformant: true, receivedAt: now.toISOString(), doc: ro.order,
        });
      }
    }

    await this.ledger.record({
      tenantId: reg.tenantId, relationshipId: result.routed?.[0]?.vendorId ?? '',
      outcome: result.held ? 'rejected' : 'accepted', source: `shopify:${shop}`, receivedAt: now.toISOString(),
      artifactId: artifact.id, dedupKey: result.idempotencyKey, occurrence: 1, docType: '850',
      delivered: !result.held, needsReview: !!result.held,
      note: result.held ? `held — unrouted SKUs: ${unmapped.join(', ')}` : `routed to ${result.routed?.length ?? 0} vendor(s)`,
    });

    return { status: 'processed', routed: result.routed?.length ?? 0, held: result.held, unmapped };
  }
}
