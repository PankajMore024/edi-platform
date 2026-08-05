import Decimal from 'decimal.js';
import { Order850 } from '../../canonical/types/document.types';
import { Address, LineItem, Party } from '../../canonical/types/common.types';
import { ShopifyOrder, ShopifyAddress, ShopifyLineItem, ShopifyOrderCreate } from './shopify.types';

/**
 * Shopify Order ⇄ canonical Order (Shopify §3, §6). Inbound (`shopifyOrderToCanonical`) is the buy-side
 * source that a multi-vendor split then routes into 850s; outbound (`canonicalToShopifyOrder`) is the
 * sell-side template that creates an order in Shopify from a partner 850. Money via decimal (never float).
 *
 * Note: party `role` carries the X12 code ('ST'/'BT') to match the current emit maps (a known shortcut;
 * canonical-role cross-ref is a later cleanup — see docs/context.md).
 */

export interface ToCanonicalOpts {
  /** PO number source: the order name ("#1001" → "1001") or the numeric order_number. Default 'name'. */
  poNumberFrom?: 'name' | 'order_number';
  /** Which currency of a `*_set` to read. Default 'shop' (the reseller's accounting currency). */
  currency?: 'shop' | 'presentment';
}

export const isTestOrder = (o: ShopifyOrder): boolean => o.test === true;

const num = (s: string | undefined | null): number => (s == null || s === '' ? 0 : new Decimal(s).toNumber());

/** Line amount, preferring the `*_set` in the chosen currency, else the bare `price`. */
function lineAmount(line: ShopifyLineItem, cur: 'shop' | 'presentment'): number {
  const set = line.price_set;
  const picked = cur === 'presentment' ? set?.presentment_money : set?.shop_money;
  return num(picked?.amount ?? line.price ?? '0');
}

function toAddress(a?: ShopifyAddress): Address | undefined {
  if (!a) return undefined;
  const name = a.name ?? ([a.first_name, a.last_name].filter(Boolean).join(' ') || a.company);
  return { name: name || undefined, line1: a.address1, line2: a.address2, city: a.city, state: a.province_code ?? a.province, postalCode: a.zip, country: a.country_code ?? a.country };
}

/** The sellable SKU on a line: `sku` (Shopify puts the variant SKU here); empty ⇒ no id ⇒ held downstream. */
const skuOf = (line: ShopifyLineItem): string | undefined => (line.sku && line.sku.trim() ? line.sku.trim() : undefined);

export function shopifyOrderToCanonical(order: ShopifyOrder, opts: ToCanonicalOpts = {}): Order850 {
  const cur = opts.currency ?? 'shop';
  const poNumber = opts.poNumberFrom === 'order_number'
    ? String(order.order_number ?? order.id)
    : (order.name ?? `#${order.order_number ?? order.id}`).replace(/^#/, '');

  const parties: Party[] = [];
  const ship = toAddress(order.shipping_address); if (ship) parties.push({ role: 'ST', address: ship });
  const bill = toAddress(order.billing_address); if (bill) parties.push({ role: 'BT', address: bill });

  const lineItems: LineItem[] = order.line_items.map((line, i) => {
    const sku = skuOf(line);
    return {
      lineNumber: String(i + 1),
      ids: sku ? [{ type: 'sku', value: sku }] : [], // no SKU → empty ids → router flags it (held)
      description: line.title,
      quantity: { value: line.quantity, uom: 'EA' },
      unitPrice: { amount: lineAmount(line, cur), currency: order.currency },
    };
  });

  return {
    meta: { docType: '850', direction: 'inbound', partner: order.customer?.email ?? '', tenantId: '' },
    poNumber,
    poDate: (order.processed_at ?? order.created_at ?? '').slice(0, 10) || undefined,
    parties: parties.length ? parties : undefined,
    references: [{ type: 'shopifyOrderId', value: String(order.id) }],
    lineItems,
    extensions: { currency: order.currency, financialStatus: order.financial_status, fulfillmentStatus: order.fulfillment_status, source: order.source_name },
  } as Order850;
}

/** Sell-side: canonical Order (from a partner 850) → a Shopify order-create body (template). */
export function canonicalToShopifyOrder(order: Order850): ShopifyOrderCreate {
  const shipTo = order.parties?.find((p) => p.role === 'ST' || p.role === 'shipTo');
  const addr = shipTo?.address;
  return {
    line_items: (order.lineItems ?? []).map((l) => ({
      sku: l.ids?.find((x) => x.type === 'sku')?.value ?? l.ids?.[0]?.value,
      title: l.description,
      quantity: l.quantity?.value ?? 0,
      price: String(l.unitPrice?.amount ?? 0),
    })),
    email: order.parties?.find((p) => p.role === 'BT')?.extensions?.email as string | undefined,
    financial_status: 'pending', // EDI-driven order, not a storefront sale
    shipping_address: addr ? { name: addr.name, address1: addr.line1, address2: addr.line2, city: addr.city, province_code: addr.state, zip: addr.postalCode, country_code: addr.country } : undefined,
    note_attributes: [{ name: 'po_number', value: order.poNumber }],
    tags: 'EDI',
  };
}
