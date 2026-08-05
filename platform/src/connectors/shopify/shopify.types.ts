/**
 * The subset of the Shopify Admin `Order` payload we consume (REST 2024-10 / `orders/*` webhooks).
 * Money is decimal STRINGS; `*_set` carries shop vs presentment currency. See docs/connectors/shopify.md §3.
 * Kept minimal + faithful to the documented shape; unknown fields are ignored (forward-compatible).
 */
export interface ShopifyMoney { amount: string; currency_code: string; }
export interface ShopifyMoneySet { shop_money: ShopifyMoney; presentment_money?: ShopifyMoney; }

export interface ShopifyAddress {
  first_name?: string; last_name?: string; name?: string; company?: string;
  address1?: string; address2?: string; city?: string;
  province?: string; province_code?: string; country?: string; country_code?: string; zip?: string; phone?: string;
}

export interface ShopifyLineItem {
  id?: number; sku?: string | null; variant_id?: number | null; product_id?: number | null;
  title?: string; variant_title?: string | null;
  quantity: number; fulfillable_quantity?: number;
  price?: string; price_set?: ShopifyMoneySet; grams?: number; vendor?: string | null;
  requires_shipping?: boolean; properties?: Array<{ name: string; value: string }>;
}

export interface ShopifyOrder {
  id: number; name?: string; order_number?: number; email?: string;
  created_at?: string; processed_at?: string | null; updated_at?: string; cancelled_at?: string | null;
  currency?: string; presentment_currency?: string;
  financial_status?: string; fulfillment_status?: string | null; test?: boolean; source_name?: string;
  total_price?: string; subtotal_price?: string; total_tax?: string; total_discounts?: string; total_price_set?: ShopifyMoneySet;
  line_items: ShopifyLineItem[];
  shipping_address?: ShopifyAddress; billing_address?: ShopifyAddress;
  customer?: { id?: number; email?: string; first_name?: string; last_name?: string };
  note?: string | null; note_attributes?: Array<{ name: string; value: string }>; tags?: string;
}

/** Shape we POST to create an order in Shopify (sell-side). A subset — enough for an EDI-driven order. */
export interface ShopifyOrderCreate {
  line_items: Array<{ sku?: string; title?: string; quantity: number; price: string }>;
  email?: string;
  financial_status: 'pending' | 'paid';
  shipping_address?: ShopifyAddress;
  note_attributes?: Array<{ name: string; value: string }>;
  tags?: string;
}
