import { Order850 } from '../../canonical/types/document.types';
import { SkuResolver } from '../../dropship/sku-resolver';
import { OrderRouter, RoutedOrder, UnmappedLine } from '../../dropship/order-router';
import { verifyShopifyHmac, parseShopifyWebhook } from './shopify-webhook';
import { shopifyOrderToCanonical, isTestOrder, ToCanonicalOpts } from './shopify-order.adapter';

/** Thrown when the webhook HMAC doesn't verify — the request is not from Shopify (or the secret is wrong). */
export class ShopifyHmacError extends Error { constructor() { super('invalid Shopify webhook HMAC'); this.name = 'ShopifyHmacError'; } }

export interface ShopifyIngestResult {
  /** Set when the webhook was intentionally not processed (e.g. a Shopify test order). */
  skipped?: 'test';
  /** For dedup/idempotency (Shopify re-delivers): the webhook id, else the order id. */
  idempotencyKey: string;
  canonical?: Order850;
  /** One canonical order per vendor after the multi-vendor split. */
  routed?: RoutedOrder[];
  /** Lines whose SKU didn't resolve — non-empty ⇒ `held` (do not emit the partial order). */
  unmapped?: UnmappedLine[];
  held?: boolean;
}

/**
 * Shopify inbound intake (Shopify §5, §7): verify the webhook → parse → (skip test orders) → map to
 * canonical → resolve SKUs and split by vendor. The result's `routed` orders are ready to emit as 850s;
 * `held` means an unmapped SKU must be resolved first (never ship a partial PO). Pure/deterministic given
 * the resolver; the actual per-vendor emit + exception recording is the pipeline's job (caller).
 */
export class ShopifyIntake {
  constructor(private readonly router: OrderRouter = new OrderRouter('sku')) {}

  ingest(
    rawBody: string,
    headers: Record<string, string | undefined>,
    secret: string,
    resolver: SkuResolver,
    opts: ToCanonicalOpts & { allowTest?: boolean } = {},
  ): ShopifyIngestResult {
    if (!verifyShopifyHmac(rawBody, headers['x-shopify-hmac-sha256'] ?? headers['X-Shopify-Hmac-Sha256'], secret)) {
      throw new ShopifyHmacError();
    }
    const wh = parseShopifyWebhook(headers, rawBody);
    const idempotencyKey = wh.webhookId ?? String(wh.order.id);

    if (isTestOrder(wh.order) && !opts.allowTest) return { skipped: 'test', idempotencyKey };

    const canonical = shopifyOrderToCanonical(wh.order, opts);
    const { orders, unmapped } = this.router.route(canonical, resolver);
    return { idempotencyKey, canonical, routed: orders, unmapped, held: unmapped.length > 0 };
  }
}
