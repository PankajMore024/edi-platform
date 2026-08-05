import { randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import { CatalogEntry, VendorPrefix } from '../../dropship/product-catalog.types';
import { SkuResolver } from '../../dropship/sku-resolver';

/**
 * Durable product catalog — sellable-SKU × vendor bindings (Shopify §4). Bindings are unique per
 * (tenant, sellable SKU, vendor); a re-put updates. `buildResolver` loads a tenant's catalog into a
 * SkuResolver (with the caller's per-vendor prefixes) for the routing hot path.
 */
export class ProductCatalogRepository {
  constructor(private readonly db: Kysely<DB>) {}

  private row(e: CatalogEntry) {
    return {
      tenant_id: e.tenantId, sellable_sku: e.sellableSku, relationship_id: e.vendorId, vendor_sku: e.vendorSku,
      pack_size: e.packSize != null ? String(e.packSize) : null, uom: e.uom ?? null,
      priority: e.priority ?? null, active: (e.active ?? true) ? 1 : 0,
    };
  }

  async upsert(e: CatalogEntry): Promise<void> {
    await this.db.insertInto('product_catalog')
      .values({ id: randomUUID(), ...this.row(e) })
      .onConflict((oc) => oc.columns(['tenant_id', 'sellable_sku', 'relationship_id']).doUpdateSet(this.row(e)))
      .execute();
  }

  async bulkUpsert(entries: CatalogEntry[]): Promise<number> {
    await this.db.transaction().execute(async (trx) => {
      for (const e of entries) {
        await trx.insertInto('product_catalog').values({ id: randomUUID(), ...this.row(e) })
          .onConflict((oc) => oc.columns(['tenant_id', 'sellable_sku', 'relationship_id']).doUpdateSet(this.row(e)))
          .execute();
      }
    });
    return entries.length;
  }

  async list(tenantId: string): Promise<CatalogEntry[]> {
    const rows = await this.db.selectFrom('product_catalog').selectAll().where('tenant_id', '=', tenantId).orderBy('sellable_sku').orderBy('priority').execute();
    return rows.map((r) => this.toEntry(r));
  }

  async delete(tenantId: string, sellableSku: string, vendorId: string): Promise<boolean> {
    const r = await this.db.deleteFrom('product_catalog').where('tenant_id', '=', tenantId).where('sellable_sku', '=', sellableSku).where('relationship_id', '=', vendorId).executeTakeFirst();
    return Number(r.numDeletedRows ?? 0) > 0;
  }

  /** Load the tenant's catalog into a resolver, combined with the given per-vendor prefixes. */
  async buildResolver(tenantId: string, prefixes: VendorPrefix[] = []): Promise<SkuResolver> {
    return new SkuResolver(await this.list(tenantId), prefixes);
  }

  private toEntry(r: DB['product_catalog']): CatalogEntry {
    return {
      tenantId: r.tenant_id, sellableSku: r.sellable_sku, vendorId: r.relationship_id, vendorSku: r.vendor_sku,
      packSize: r.pack_size != null ? Number(r.pack_size) : undefined, uom: r.uom ?? undefined,
      priority: r.priority ?? undefined, active: r.active === 1,
    };
  }
}
