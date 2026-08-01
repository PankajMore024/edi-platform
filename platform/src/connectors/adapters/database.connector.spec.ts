import { DatabaseConnector } from './database.connector';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorInstance } from '../connector.types';

describe('DatabaseConnector (SQL rowset ↔ canonical)', () => {
  const make = () => new DatabaseConnector(new ObjectMapper(), new ConnectorRegistry());

  const instance = (): ConnectorInstance => ({
    id: 'ci-db', tenantId: 't1', connectorType: 'database',
    settings: {}, docTypes: ['850'], trigger: 'poll',
    connectorMap: {
      connector: 'database', docType: '850', direction: 'inbound',
      header: [{ to: 'poNumber', from: 'po_number' }],
      lineTo: 'lineItems',
      lineFields: [
        { to: 'ids.0.value', from: 'sku' },
        { to: 'quantity.value', from: 'qty', decimal: 0 },
        { to: 'unitPrice.amount', from: 'unit_price', decimal: 2 },
      ],
    },
  });

  it('registers under class "database"', () => {
    expect(make().descriptor()).toMatchObject({ id: 'database', class: 'database' });
  });

  it('translates a query result set (array of rows) to canonical', async () => {
    const rows = [
      { po_number: '4500', sku: 'A1', qty: '10', unit_price: '18.50' },
      { po_number: '4500', sku: 'B2', qty: '5', unit_price: '44.00' },
    ];
    const [doc] = (await make().ingest(rows, instance())) as any[];
    expect(doc.meta.tenantId).toBe('t1');
    expect(doc.poNumber).toBe('4500');
    expect(doc.lineItems).toEqual([
      { ids: [{ value: 'A1' }], quantity: { value: 10 }, unitPrice: { amount: 18.5 } },
      { ids: [{ value: 'B2' }], quantity: { value: 5 }, unitPrice: { amount: 44 } },
    ]);
  });

  it('rejects a payload that is not a rowset (array of objects)', async () => {
    await expect(make().ingest({ not: 'an array' }, instance())).rejects.toThrow(/array of row objects/);
  });

  it('emitData produces rows to upsert', async () => {
    const doc: any = { poNumber: '4500', lineItems: [{ ids: [{ value: 'A1' }], quantity: { value: 10 }, unitPrice: { amount: 18.5 } }] };
    const rows = await make().emitData(doc, instance());
    expect(rows).toEqual([{ po_number: '4500', sku: 'A1', qty: '10', unit_price: '18.50' }]);
  });
});
