import Decimal from 'decimal.js';
import { Order850 } from '../canonical/types/document.types';
import { LineItem } from '../canonical/types/common.types';
import { SkuResolver } from './sku-resolver';

/** One vendor's slice of a split order — the canonical Order to translate into an 850 for that vendor. */
export interface RoutedOrder { vendorId: string; order: Order850; }
export interface UnmappedLine { lineNumber?: string; sku?: string; }
export interface RouteResult { orders: RoutedOrder[]; unmapped: UnmappedLine[]; }

/**
 * Splits one canonical Order across vendors (Shopify §5). Each line's sellable SKU is resolved to a
 * vendor + vendor SKU (+ pack/uom) via the SkuResolver; lines group by vendor into one Order each, with
 * SKUs translated and quantities pack-converted. Lines that don't resolve are returned in `unmapped` —
 * the caller HOLDS the whole order (never emit a partial PO with an unknown item).
 *
 * Pure/deterministic. `skuType` selects which of a line's `ids[]` carries the sellable SKU (default 'sku');
 * falls back to the line's first id.
 */
export class OrderRouter {
  constructor(private readonly skuType: string = 'sku') {}

  private skuIndex(line: LineItem): number {
    const ids = line.ids ?? [];
    const typed = ids.findIndex((i) => (i.type ?? '').toLowerCase() === this.skuType.toLowerCase());
    return typed >= 0 ? typed : (ids.length ? 0 : -1);
  }

  route(order: Order850, resolver: SkuResolver): RouteResult {
    const groups = new Map<string, LineItem[]>();
    const unmapped: UnmappedLine[] = [];

    for (const line of order.lineItems ?? []) {
      const idx = this.skuIndex(line);
      const sku = idx >= 0 ? line.ids?.[idx]?.value : undefined;
      if (!sku) { unmapped.push({ lineNumber: line.lineNumber, sku: undefined }); continue; }
      const res = resolver.resolve(sku);
      if (!res) { unmapped.push({ lineNumber: line.lineNumber, sku }); continue; }

      // translate the line for this vendor: rewrite the sku id, pack-convert the quantity
      const ids = (line.ids ?? []).map((id, i) => (i === idx ? { ...id, value: res.vendorSku } : id));
      let quantity = line.quantity;
      if (quantity && (res.packSize || res.uom)) {
        const value = res.packSize && res.packSize > 1
          ? new Decimal(quantity.value ?? 0).div(res.packSize).toNumber()
          : quantity.value;
        quantity = { ...quantity, value, uom: res.uom ?? quantity.uom };
      }
      const translated: LineItem = { ...line, ids, quantity };
      (groups.get(res.vendorId) ?? groups.set(res.vendorId, []).get(res.vendorId)!).push(translated);
    }

    const orders: RoutedOrder[] = [...groups.entries()].map(([vendorId, lineItems]) => ({
      vendorId,
      order: { ...order, lineItems },
    }));
    return { orders, unmapped };
  }
}
