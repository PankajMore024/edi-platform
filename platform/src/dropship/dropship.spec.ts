import { SkuResolver } from './sku-resolver';
import { OrderRouter } from './order-router';
import { CatalogEntry } from './product-catalog.types';
import { Order850 } from '../canonical/types/document.types';

const entry = (o: Partial<CatalogEntry>): CatalogEntry => ({ tenantId: 't1', sellableSku: 'X', vendorId: 'v', vendorSku: 'VX', ...o });

describe('SkuResolver', () => {
  it('resolves via the catalog, lowest priority wins when multi-sourced', () => {
    const r = new SkuResolver([
      entry({ sellableSku: 'WIDGET-BLUE', vendorId: 'ridgeline', vendorSku: 'RDG-4471', priority: 1, packSize: 12, uom: 'CA' }),
      entry({ sellableSku: 'WIDGET-BLUE', vendorId: 'summit', vendorSku: 'SMT-BLU', priority: 2 }),
    ]);
    expect(r.resolve('WIDGET-BLUE')).toEqual({ vendorId: 'ridgeline', vendorSku: 'RDG-4471', packSize: 12, uom: 'CA', via: 'catalog' });
  });

  it('resolves via the longest matching per-vendor prefix, stripping it to the vendor SKU', () => {
    const r = new SkuResolver([], [{ vendorId: 'ridgeline', prefix: 'RDG-' }, { vendorId: 'summit', prefix: 'SMT-' }]);
    expect(r.resolve('RDG-4471')).toEqual({ vendorId: 'ridgeline', vendorSku: '4471', via: 'prefix' });
    expect(r.resolve('SMT-BLU')).toEqual({ vendorId: 'summit', vendorSku: 'BLU', via: 'prefix' });
  });

  it('prefers the catalog over the prefix, and returns undefined when unmapped', () => {
    const r = new SkuResolver([entry({ sellableSku: 'RDG-9', vendorId: 'summit', vendorSku: 'S9' })], [{ vendorId: 'ridgeline', prefix: 'RDG-' }]);
    expect(r.resolve('RDG-9')!.via).toBe('catalog'); // catalog wins over the RDG- prefix
    expect(r.resolve('UNKNOWN-1')).toBeUndefined();
  });

  it('ignores inactive catalog entries', () => {
    const r = new SkuResolver([entry({ sellableSku: 'A', vendorId: 'v', vendorSku: 'VA', active: false })]);
    expect(r.resolve('A')).toBeUndefined();
  });
});

describe('OrderRouter (multi-vendor split)', () => {
  const router = new OrderRouter('sku');
  const line = (sku: string, qty: number): any => ({ lineNumber: sku, ids: [{ type: 'sku', value: sku }], quantity: { value: qty, uom: 'EA' }, unitPrice: { amount: 5 } });
  const order = (lines: any[]): Order850 => ({ meta: { docType: '850', direction: 'inbound', partner: '', tenantId: 't1' }, poNumber: 'SH-1', lineItems: lines });

  it('splits one order into one 850 per vendor, translating SKUs', () => {
    const resolver = new SkuResolver([], [{ vendorId: 'ridgeline', prefix: 'RDG-' }, { vendorId: 'summit', prefix: 'SMT-' }]);
    const r = router.route(order([line('RDG-1', 2), line('SMT-2', 3), line('RDG-3', 1)]), resolver);
    expect(r.unmapped).toEqual([]);
    expect(r.orders).toHaveLength(2);
    const ridge = r.orders.find((o) => o.vendorId === 'ridgeline')!;
    expect(ridge.order.lineItems.map((l) => l.ids![0].value)).toEqual(['1', '3']); // prefix stripped
    const summit = r.orders.find((o) => o.vendorId === 'summit')!;
    expect(summit.order.lineItems.map((l) => l.ids![0].value)).toEqual(['2']);
  });

  it('pack-converts quantity to the vendor UoM (eaches → cases)', () => {
    const resolver = new SkuResolver([{ tenantId: 't1', sellableSku: 'W', vendorId: 'v', vendorSku: 'VW', packSize: 12, uom: 'CA' }]);
    const r = router.route(order([line('W', 24)]), resolver);
    expect(r.orders[0].order.lineItems[0].quantity).toEqual({ value: 2, uom: 'CA' }); // 24 eaches / 12 = 2 cases
  });

  it('holds the order: an unmapped or SKU-less line is reported, not silently dropped', () => {
    const resolver = new SkuResolver([], [{ vendorId: 'ridgeline', prefix: 'RDG-' }]);
    const noSku: any = { lineNumber: '9', ids: [], quantity: { value: 1 } };
    const r = router.route(order([line('RDG-1', 1), line('NOPE-2', 1), noSku]), resolver);
    expect(r.unmapped).toContainEqual({ lineNumber: '9', sku: undefined });
    expect(r.unmapped).toContainEqual({ lineNumber: 'NOPE-2', sku: 'NOPE-2' });
    expect(r.orders).toHaveLength(1); // only the resolvable line routed; caller holds the order because unmapped is non-empty
  });
});
