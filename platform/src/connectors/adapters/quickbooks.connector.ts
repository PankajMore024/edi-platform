import { Injectable } from '@nestjs/common';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorDescriptor, ConnectorMap } from '../connector.types';
import { PayloadConnector } from './payload-connector.base';

/**
 * QuickBooks Online connector (accounting/ERP). Translation is generic; ships a starter template for
 * a QBO invoice → canonical 810. LIVE fetch (QBO REST API) + OAuth2 = transport layer.
 */
@Injectable()
export class QuickBooksConnector extends PayloadConnector {
  constructor(mapper: ObjectMapper, registry: ConnectorRegistry) {
    super('quickbooks', mapper, registry);
  }

  descriptor(): ConnectorDescriptor {
    return { id: 'quickbooks', kind: 'connector', class: 'erp', name: 'QuickBooks Online', description: 'QBO REST API (invoice/item)' };
  }
}

/** Starter template (QBO invoice → canonical 810). Verify against the live QBO API schema/version. */
export const QUICKBOOKS_INVOICE_TEMPLATE: ConnectorMap = {
  connector: 'quickbooks', docType: '810', direction: 'inbound',
  header: [
    { to: 'invoiceNumber', from: 'DocNumber' },
    { to: 'invoiceDate', from: 'TxnDate' },
    { to: 'totalAmount', from: 'TotalAmt', decimal: 2 },
  ],
  lineTo: 'lineItems', lineOver: 'Line',
  lineFields: [
    { to: 'ids.0.value', from: 'SalesItemLineDetail.ItemRef.value' },
    { to: 'quantity.value', from: 'SalesItemLineDetail.Qty', decimal: 0 },
    { to: 'unitPrice.amount', from: 'SalesItemLineDetail.UnitPrice', decimal: 2 },
  ],
};
