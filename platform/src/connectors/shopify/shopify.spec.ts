import { createHmac } from 'crypto';
import { shopifyOrderToCanonical, canonicalToShopifyOrder, isTestOrder } from './shopify-order.adapter';
import { verifyShopifyHmac, parseShopifyWebhook } from './shopify-webhook';
import { ShopifyIntake, ShopifyHmacError } from './shopify-intake';
import { ShopifyOrder } from './shopify.types';
import { SkuResolver } from '../../dropship/sku-resolver';

// A realistic Shopify order (documented shape): 3 lines across two vendor prefixes, ship+bill addresses,
// a multi-currency line (price_set), and one line with no SKU.
const ORDER: ShopifyOrder = {
  id: 8123456789, name: '#1001', order_number: 1001, email: 'buyer@shop.co',
  created_at: '2026-08-05T14:30:00-04:00', processed_at: '2026-08-05T14:31:00-04:00',
  currency: 'USD', presentment_currency: 'CAD', financial_status: 'paid', fulfillment_status: null, test: false,
  total_price: '112.50', line_items: [
    { id: 1, sku: 'RDG-4471', title: 'Blue Widget', quantity: 2, price: '18.50', price_set: { shop_money: { amount: '18.50', currency_code: 'USD' }, presentment_money: { amount: '25.10', currency_code: 'CAD' } } },
    { id: 2, sku: 'SMT-BLU', title: 'Summit Blue', quantity: 3, price: '22.00' },
    { id: 3, sku: 'RDG-88', title: 'Sprocket', quantity: 1, price: '9.50' },
    { id: 4, sku: null, title: 'Gift note (custom)', quantity: 1, price: '0.00' },
  ],
  shipping_address: { first_name: 'Ada', last_name: 'Lovelace', address1: '1 Analytical Way', city: 'London', province_code: 'LDN', country_code: 'GB', zip: 'EC1', phone: '+44' },
  billing_address: { name: 'Ada Lovelace', address1: '1 Analytical Way', city: 'London', country_code: 'GB', zip: 'EC1' },
  customer: { email: 'buyer@shop.co', first_name: 'Ada', last_name: 'Lovelace' },
};

const resolver = () => new SkuResolver([], [{ vendorId: 'rel-ridgeline', prefix: 'RDG-' }, { vendorId: 'rel-summit', prefix: 'SMT-' }]);

describe('Shopify order → canonical', () => {
  it('maps header, parties, and line items (money via shop currency)', () => {
    const c = shopifyOrderToCanonical(ORDER) as any;
    expect(c.poNumber).toBe('1001'); // "#1001" → strip '#'
    expect(c.poDate).toBe('2026-08-05');
    expect(c.parties.map((p: any) => p.role)).toEqual(['ST', 'BT']);
    expect(c.parties[0].address).toMatchObject({ name: 'Ada Lovelace', line1: '1 Analytical Way', city: 'London', state: 'LDN', country: 'GB' });
    expect(c.lineItems[0]).toMatchObject({ ids: [{ type: 'sku', value: 'RDG-4471' }], quantity: { value: 2, uom: 'EA' }, unitPrice: { amount: 18.5, currency: 'USD' } });
    expect(c.extensions.currency).toBe('USD');
  });

  it('reads the presentment currency when asked (multi-currency)', () => {
    const c = shopifyOrderToCanonical(ORDER, { currency: 'presentment' }) as any;
    expect(c.lineItems[0].unitPrice.amount).toBe(25.1); // CAD presentment_money
  });

  it('a line with no SKU produces empty ids (so the router holds the order)', () => {
    const c = shopifyOrderToCanonical(ORDER) as any;
    expect(c.lineItems[3].ids).toEqual([]);
  });

  it('flags test orders', () => {
    expect(isTestOrder({ ...ORDER, test: true })).toBe(true);
    expect(isTestOrder(ORDER)).toBe(false);
  });
});

describe('Shopify webhook verification', () => {
  const secret = 'shpss_test_secret';
  const body = JSON.stringify(ORDER);
  const goodHmac = createHmac('sha256', secret).update(body, 'utf8').digest('base64');

  it('verifies a correct HMAC and rejects a wrong one / wrong secret / missing header', () => {
    expect(verifyShopifyHmac(body, goodHmac, secret)).toBe(true);
    expect(verifyShopifyHmac(body, goodHmac, 'other-secret')).toBe(false);
    expect(verifyShopifyHmac(body + ' ', goodHmac, secret)).toBe(false); // tampered body
    expect(verifyShopifyHmac(body, undefined, secret)).toBe(false);
  });

  it('parses the webhook envelope from headers', () => {
    const wh = parseShopifyWebhook({ 'x-shopify-topic': 'orders/create', 'x-shopify-shop-domain': 'demo.myshopify.com', 'x-shopify-webhook-id': 'wh-1' }, body);
    expect(wh).toMatchObject({ topic: 'orders/create', shopDomain: 'demo.myshopify.com', webhookId: 'wh-1' });
    expect(wh.order.id).toBe(ORDER.id);
  });
});

describe('ShopifyIntake (verify → canonical → split)', () => {
  const intake = new ShopifyIntake();
  const secret = 'shpss_test_secret';
  const body = JSON.stringify(ORDER);
  const headers = (over: Record<string, string | undefined> = {}) => ({
    'x-shopify-hmac-sha256': createHmac('sha256', secret).update(body, 'utf8').digest('base64'),
    'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'wh-42', ...over,
  });

  it('rejects a bad signature', () => {
    expect(() => intake.ingest(body, headers({ 'x-shopify-hmac-sha256': 'bogus' }), secret, resolver())).toThrow(ShopifyHmacError);
  });

  it('splits a verified order into one canonical order per vendor, and holds on the unmapped line', () => {
    const r = intake.ingest(body, headers(), secret, resolver());
    expect(r.idempotencyKey).toBe('wh-42');
    expect(r.routed!.map((o) => o.vendorId).sort()).toEqual(['rel-ridgeline', 'rel-summit']);
    const ridge = r.routed!.find((o) => o.vendorId === 'rel-ridgeline')!;
    expect(ridge.order.lineItems.map((l) => l.ids![0].value)).toEqual(['4471', '88']); // prefix stripped
    expect(r.held).toBe(true); // the no-SKU line is unmapped
    expect(r.unmapped).toContainEqual({ lineNumber: '4', sku: undefined });
  });

  it('skips Shopify test orders', () => {
    const testBody = JSON.stringify({ ...ORDER, test: true });
    const h = { 'x-shopify-hmac-sha256': createHmac('sha256', secret).update(testBody, 'utf8').digest('base64'), 'x-shopify-webhook-id': 'wh-test' };
    expect(intake.ingest(testBody, h, secret, resolver())).toEqual({ skipped: 'test', idempotencyKey: 'wh-test' });
  });
});

describe('canonical → Shopify order (sell-side template)', () => {
  it('builds a create body from a canonical order', () => {
    const canonical = shopifyOrderToCanonical(ORDER);
    const body = canonicalToShopifyOrder(canonical);
    expect(body.financial_status).toBe('pending');
    expect(body.line_items[0]).toMatchObject({ sku: 'RDG-4471', quantity: 2, price: '18.5' });
    expect(body.shipping_address).toMatchObject({ city: 'London', country_code: 'GB' });
    expect(body.note_attributes).toEqual([{ name: 'po_number', value: '1001' }]);
  });
});
