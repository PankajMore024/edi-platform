import { Kysely } from 'kysely';
import { createDatabase } from '../database';
import { createSchema } from '../migrations';
import { DB } from '../schema';
import { ProductCatalogRepository } from './product-catalog.repository';

describe('ProductCatalogRepository (durable dropship catalog, node:sqlite)', () => {
  let db: Kysely<DB>;
  let repo: ProductCatalogRepository;
  beforeEach(async () => { db = createDatabase({ sqliteFile: ':memory:' }); await createSchema(db); repo = new ProductCatalogRepository(db); });
  afterEach(async () => { await db.destroy(); });

  it('upserts a binding (unique per tenant+sku+vendor) and reads it back, tenant-scoped', async () => {
    await repo.upsert({ tenantId: 't1', sellableSku: 'WIDGET-BLUE', vendorId: 'ridgeline', vendorSku: 'RDG-4471', packSize: 12, uom: 'CA', priority: 1 });
    await repo.upsert({ tenantId: 't1', sellableSku: 'WIDGET-BLUE', vendorId: 'ridgeline', vendorSku: 'RDG-4471-NEW' }); // same binding → update
    const list = await repo.list('t1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sellableSku: 'WIDGET-BLUE', vendorId: 'ridgeline', vendorSku: 'RDG-4471-NEW' });
    expect(await repo.list('t2')).toEqual([]);
  });

  it('bulk-upserts and builds a resolver that routes via the loaded catalog', async () => {
    const n = await repo.bulkUpsert([
      { tenantId: 't1', sellableSku: 'A', vendorId: 'v1', vendorSku: 'VA', packSize: 6, uom: 'CA' },
      { tenantId: 't1', sellableSku: 'B', vendorId: 'v2', vendorSku: 'VB' },
    ]);
    expect(n).toBe(2);
    const resolver = await repo.buildResolver('t1', [{ vendorId: 'v3', prefix: 'P-' }]);
    expect(resolver.resolve('A')).toMatchObject({ vendorId: 'v1', vendorSku: 'VA', packSize: 6, via: 'catalog' });
    expect(resolver.resolve('P-99')).toMatchObject({ vendorId: 'v3', vendorSku: '99', via: 'prefix' }); // prefix still layered in
    expect(resolver.resolve('ZZ')).toBeUndefined();
  });

  it('deletes a binding', async () => {
    await repo.upsert({ tenantId: 't1', sellableSku: 'A', vendorId: 'v1', vendorSku: 'VA' });
    expect(await repo.delete('t1', 'A', 'v1')).toBe(true);
    expect(await repo.list('t1')).toEqual([]);
    expect(await repo.delete('t1', 'A', 'v1')).toBe(false);
  });
});
