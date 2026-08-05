/**
 * Dropship SKU/reference engine (Shopify spec §4–§5). A sellable SKU (what the customer bought) is not
 * the vendor's part number, and one order may span several vendors. These types describe how a sellable
 * SKU resolves to (vendor, vendorSku, pack/uom) — the routing + translation table for the multi-vendor
 * split. Two strategies (catalog table → per-vendor prefix → unmapped); see SkuResolver.
 */

/** One sellable-SKU × vendor binding (a row of the product catalog). */
export interface CatalogEntry {
  tenantId: string;
  sellableSku: string;
  /** The vendor relationship this binding routes to. */
  vendorId: string;
  vendorSku: string;
  /** Units per case, when the vendor is ordered in a larger pack than we sell (eaches → cases). */
  packSize?: number;
  /** Vendor's order UoM (e.g. 'CA'); defaults to the line's own uom when absent. */
  uom?: string;
  /** Lower = preferred when a SKU is multi-sourced. Default: 0. */
  priority?: number;
  active?: boolean;
}

/** A per-vendor SKU prefix convention (the lightweight default): a sellable SKU beginning with `prefix`
 * routes to `vendorId`, and stripping the prefix yields the vendor SKU. */
export interface VendorPrefix { vendorId: string; prefix: string; }

/** The outcome of resolving one sellable SKU. `undefined` from the resolver means UNMAPPED. */
export interface SkuResolution {
  vendorId: string;
  vendorSku: string;
  packSize?: number;
  uom?: string;
  via: 'catalog' | 'prefix';
}
