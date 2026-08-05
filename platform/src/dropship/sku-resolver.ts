import { CatalogEntry, VendorPrefix, SkuResolution } from './product-catalog.types';

/**
 * Resolves a sellable SKU → (vendor, vendorSku, pack/uom), tenant-scoped. Resolution order (Shopify §4):
 *   1. catalog table — an active entry for the sellable SKU (lowest `priority` wins when multi-sourced);
 *   2. per-vendor prefix — the longest matching prefix routes + strips to the vendor SKU;
 *   3. neither ⇒ `undefined` (UNMAPPED — the caller holds the order; never silently ship an unknown item).
 * Pure and deterministic; built from a catalog snapshot + the tenant's vendor prefixes.
 */
export class SkuResolver {
  private readonly bySku = new Map<string, CatalogEntry[]>();
  private readonly prefixes: VendorPrefix[];

  constructor(entries: CatalogEntry[], prefixes: VendorPrefix[] = []) {
    for (const e of entries) {
      if (e.active === false) continue;
      const list = this.bySku.get(e.sellableSku) ?? [];
      list.push(e);
      this.bySku.set(e.sellableSku, list);
    }
    // longest prefix first so the most specific vendor wins
    this.prefixes = [...prefixes].sort((a, b) => b.prefix.length - a.prefix.length);
  }

  resolve(sellableSku: string): SkuResolution | undefined {
    // 1. catalog (lowest priority number preferred)
    const entries = this.bySku.get(sellableSku);
    if (entries && entries.length) {
      const best = [...entries].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))[0];
      return { vendorId: best.vendorId, vendorSku: best.vendorSku, packSize: best.packSize, uom: best.uom, via: 'catalog' };
    }
    // 2. prefix convention
    for (const p of this.prefixes) {
      if (p.prefix && sellableSku.startsWith(p.prefix)) {
        return { vendorId: p.vendorId, vendorSku: sellableSku.slice(p.prefix.length), via: 'prefix' };
      }
    }
    // 3. unmapped
    return undefined;
  }
}
