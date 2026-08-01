import { GenericRestConnector } from './generic-rest.connector';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorInstance } from '../connector.types';

describe('GenericRestConnector', () => {
  const make = () => new GenericRestConnector(new ObjectMapper(), new ConnectorRegistry());

  const instance = (): ConnectorInstance => ({
    id: 'ci-2', tenantId: 't1', connectorType: 'generic-rest',
    settings: {}, docTypes: ['850'], trigger: 'webhook',
    connectorMap: {
      connector: 'generic-rest', docType: '850', direction: 'inbound',
      header: [{ to: 'poNumber', from: 'orderId' }],
      lineTo: 'lineItems', lineOver: 'items',
      lineFields: [{ to: 'ids.0.value', from: 'sku' }, { to: 'unitPrice.amount', from: 'price', decimal: 2 }],
    },
  });

  it('maps a JSON payload with nested lines to canonical', async () => {
    const payload = { orderId: '4500', items: [{ sku: 'A1', price: '18.50' }, { sku: 'B2', price: '44.00' }] };
    const [doc] = (await make().ingest(payload, instance())) as any[];
    expect(doc.meta.tenantId).toBe('t1');
    expect(doc.poNumber).toBe('4500');
    expect(doc.lineItems).toEqual([
      { ids: [{ value: 'A1' }], unitPrice: { amount: 18.5 } },
      { ids: [{ value: 'B2' }], unitPrice: { amount: 44 } },
    ]);
  });

  it('rejects a non-object payload', async () => {
    await expect(make().ingest('not json', instance())).rejects.toThrow(/JSON object/);
  });

  it('emitData renders canonical back to a nested JSON object', async () => {
    const doc: any = { poNumber: '4500', lineItems: [{ ids: [{ value: 'A1' }], unitPrice: { amount: 18.5 } }] };
    expect(await make().emitData(doc, instance())).toEqual({ orderId: '4500', items: [{ sku: 'A1', price: '18.50' }] });
  });
});
