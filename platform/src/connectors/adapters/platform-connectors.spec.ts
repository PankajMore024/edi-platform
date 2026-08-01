import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ShopifyConnector, SHOPIFY_ORDER_TEMPLATE } from './shopify.connector';
import { AmazonConnector, AMAZON_ORDER_TEMPLATE } from './amazon.connector';
import { QuickBooksConnector, QUICKBOOKS_INVOICE_TEMPLATE } from './quickbooks.connector';
import { ConnectorInstance } from '../connector.types';

const inst = (type: string, connectorMap: any): ConnectorInstance => ({
  id: `ci-${type}`, tenantId: 't1', connectorType: type, settings: {},
  connectorMap, docTypes: ['850'], trigger: 'webhook',
});

describe('platform connectors (translate a payload via their default template)', () => {
  const make = <T,>(Ctor: new (m: ObjectMapper, r: ConnectorRegistry) => T): T =>
    new Ctor(new ObjectMapper(), new ConnectorRegistry());

  it('Shopify order → canonical', async () => {
    const payload = { name: '#1001', created_at: '2026-08-01', line_items: [{ sku: 'A1', quantity: 2, price: '9.99' }] };
    const [doc] = (await make(ShopifyConnector).ingest(payload, inst('shopify', SHOPIFY_ORDER_TEMPLATE))) as any[];
    expect(doc.poNumber).toBe('#1001');
    expect(doc.lineItems).toEqual([{ ids: [{ value: 'A1' }], quantity: { value: 2 }, unitPrice: { amount: 9.99 } }]);
  });

  it('Amazon SP-API order → canonical (nested ItemPrice.Amount)', async () => {
    const payload = { AmazonOrderId: '123-456', PurchaseDate: '2026-08-01', OrderItems: [{ SellerSKU: 'A1', QuantityOrdered: 3, ItemPrice: { Amount: '19.99' } }] };
    const [doc] = (await make(AmazonConnector).ingest(payload, inst('amazon', AMAZON_ORDER_TEMPLATE))) as any[];
    expect(doc.poNumber).toBe('123-456');
    expect(doc.lineItems).toEqual([{ ids: [{ value: 'A1' }], quantity: { value: 3 }, unitPrice: { amount: 19.99 } }]);
  });

  it('QuickBooks invoice → canonical 810 (deeply nested SalesItemLineDetail)', async () => {
    const payload = {
      DocNumber: 'INV-1', TxnDate: '2026-08-01', TotalAmt: '59.97',
      Line: [{ SalesItemLineDetail: { ItemRef: { value: 'A1' }, Qty: 3, UnitPrice: '19.99' } }],
    };
    const [doc] = (await make(QuickBooksConnector).ingest(payload, inst('quickbooks', QUICKBOOKS_INVOICE_TEMPLATE))) as any[];
    expect(doc.invoiceNumber).toBe('INV-1');
    expect(doc.totalAmount).toBe(59.97);
    expect(doc.lineItems).toEqual([{ ids: [{ value: 'A1' }], quantity: { value: 3 }, unitPrice: { amount: 19.99 } }]);
  });

  it('each payload connector registers under its own type (not undefined)', () => {
    const reg = new ConnectorRegistry();
    const mapper = new ObjectMapper();
    // eslint-disable-next-line @typescript-eslint/no-new
    new ShopifyConnector(mapper, reg); new AmazonConnector(mapper, reg); new QuickBooksConnector(mapper, reg);
    expect(reg.list().map((d) => d.id).sort()).toEqual(['amazon', 'quickbooks', 'shopify']);
    expect(reg.list().find((d) => d.id === 'quickbooks')).toMatchObject({ class: 'erp' });
  });
});
