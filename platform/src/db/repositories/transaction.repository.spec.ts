import { Kysely } from 'kysely';
import { createDatabase } from '../database';
import { createSchema } from '../migrations';
import { DB } from '../schema';
import { TransactionRepository } from './transaction.repository';
import { SaveTransaction } from '../../intake/transaction-store';

describe('TransactionRepository (canonical ⇄ normalized rows)', () => {
  let db: Kysely<DB>;
  let repo: TransactionRepository;
  beforeEach(async () => { db = createDatabase({ sqliteFile: ':memory:' }); await createSchema(db); repo = new TransactionRepository(db); });
  afterEach(async () => { await db.destroy(); });

  const base = (over: Partial<SaveTransaction>): SaveTransaction => ({
    tenantId: 't1', relationshipId: 'rel', direction: 'inbound', docType: '850',
    transactionControlNumber: '0001', functionalGroupControlNumber: '1',
    currentState: 'DELIVERED', conformant: true, receivedAt: '2026-08-02T09:00:00.000Z',
    doc: { meta: {} } as any, ...over,
  });

  it('round-trips an 810 invoice (subtype fields + total + lines)', async () => {
    const doc: any = {
      meta: { docType: '810', direction: 'inbound', partner: '', tenantId: 't1' },
      invoiceNumber: 'INV-9', invoiceDate: '2026-08-01', poNumber: '4500', totalAmount: 59.97,
      lineItems: [{ lineNumber: '1', ids: [{ type: 'UP', value: '012345678905' }], quantity: { value: 3, uom: 'EA' }, unitPrice: { amount: 19.99 } }],
    };
    const id = await repo.save(base({ docType: '810', doc }));
    const got = await repo.get('t1', id);
    const c = got!.canonical as any;
    expect(got).toMatchObject({ docType: '810', poNumber: '4500' });
    expect(c.invoiceNumber).toBe('INV-9');
    expect(c.totalAmount).toBe(59.97);
    expect(c.lineItems[0]).toMatchObject({ quantity: { value: 3, uom: 'EA' }, unitPrice: { amount: 19.99 } });
    expect(c.lineItems[0].ids).toEqual([{ type: 'UP', value: '012345678905' }]); // qualified id kept in the identifier table
  });

  it('round-trips an 855 with per-line ack status (line subtype)', async () => {
    const doc: any = {
      meta: { docType: '855', direction: 'inbound', partner: '', tenantId: 't1' },
      poNumber: '4500', ackType: 'AD',
      lineItems: [{ lineNumber: '1', ids: [{ type: 'VN', value: 'A1' }], quantity: { value: 5 }, ackStatus: 'IA' }],
    };
    const id = await repo.save(base({ docType: '855', doc }));
    const c = (await repo.get('t1', id))!.canonical as any;
    expect(c.ackType).toBe('AD');
    expect(c.lineItems[0].ackStatus).toBe('IA');
  });

  it('round-trips an 850 with parties + references', async () => {
    const doc: any = {
      meta: { docType: '850', direction: 'inbound', partner: '', tenantId: 't1' },
      poNumber: '4500', poDate: '2026-07-31',
      parties: [{ role: 'shipTo', ids: [{ type: '92', value: 'STORE-42' }], address: { name: 'Store 42', city: 'Austin', state: 'TX', postalCode: '78701' } }],
      references: [{ type: 'vendorOrderNumber', value: 'VN-77' }],
      lineItems: [{ ids: [{ type: 'UP', value: 'A1' }], quantity: { value: 10, uom: 'EA' }, unitPrice: { amount: 18.5 } }],
    };
    const id = await repo.save(base({ doc }));
    const c = (await repo.get('t1', id))!.canonical as any;
    expect(c.parties[0]).toMatchObject({ role: 'shipTo', address: { city: 'Austin', state: 'TX' } });
    expect(c.references).toEqual([{ type: 'vendorOrderNumber', value: 'VN-77' }]);
  });

  it('persists a REJECTED doc too (queryable for review), and lists by state', async () => {
    await repo.save(base({ doc: { meta: {}, poNumber: '4500', lineItems: [] } as any }));
    await repo.save(base({ currentState: 'REJECTED', conformant: false, reason: 'bad', doc: { meta: {}, poNumber: '4599', lineItems: [] } as any }));
    expect((await repo.list('t1', { state: 'REJECTED' })).items.map((t) => t.poNumber)).toEqual(['4599']);
    const all = await repo.list('t1');
    expect(all.items).toHaveLength(2);
    expect(all.total).toBe(2);
  });

  it('paginates and filters by relationship (partner-scoped, stable order)', async () => {
    for (let i = 0; i < 5; i++) await repo.save(base({ relationshipId: 'rel-A', doc: { meta: {}, poNumber: `A${i}`, lineItems: [] } as any }));
    await repo.save(base({ relationshipId: 'rel-B', doc: { meta: {}, poNumber: 'B0', lineItems: [] } as any }));

    const relA = await repo.list('t1', { relationshipId: 'rel-A' });
    expect(relA.total).toBe(5);
    expect(relA.items.every((t) => t.poNumber?.startsWith('A'))).toBe(true);

    const page1 = await repo.list('t1', { relationshipId: 'rel-A', limit: 2, offset: 0 });
    const page2 = await repo.list('t1', { relationshipId: 'rel-A', limit: 2, offset: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5); // total ignores the page window
    expect(page1.items.map((t) => t.id)).not.toEqual(page2.items.map((t) => t.id)); // distinct pages
  });
});
