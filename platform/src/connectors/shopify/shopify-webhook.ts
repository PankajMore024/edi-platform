import { createHmac, timingSafeEqual } from 'crypto';
import { ShopifyOrder } from './shopify.types';

/**
 * Shopify webhook verification + parsing (Shopify §7). HMAC is `base64(HMAC-SHA256(rawBody, secret))`
 * over the RAW request body (before JSON parse) — deterministic, testable with no live store.
 */

export function verifyShopifyHmac(rawBody: string, hmacHeaderBase64: string | undefined, secret: string): boolean {
  if (!hmacHeaderBase64) return false;
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeaderBase64);
  return a.length === b.length && timingSafeEqual(a, b); // constant-time
}

export interface ShopifyWebhook {
  topic?: string;
  shopDomain?: string;
  webhookId?: string;
  apiVersion?: string;
  order: ShopifyOrder;
}

/** Extract the Shopify webhook envelope from headers + the parsed order body. Header keys are lowercased. */
export function parseShopifyWebhook(headers: Record<string, string | undefined>, rawBody: string): ShopifyWebhook {
  const h = (k: string) => headers[k] ?? headers[k.toLowerCase()];
  return {
    topic: h('x-shopify-topic'),
    shopDomain: h('x-shopify-shop-domain'),
    webhookId: h('x-shopify-webhook-id'),
    apiVersion: h('x-shopify-api-version'),
    order: JSON.parse(rawBody) as ShopifyOrder,
  };
}
