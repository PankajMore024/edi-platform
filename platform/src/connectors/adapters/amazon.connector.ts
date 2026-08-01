import { Injectable } from '@nestjs/common';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorDescriptor, ConnectorMap } from '../connector.types';
import { PayloadConnector } from './payload-connector.base';

/**
 * Amazon connector (marketplace, SP-API). Translation is generic; ships a starter template for an
 * SP-API order → canonical. LIVE fetch (SP-API orders/notifications, LWA + SigV4 auth, async feed
 * polling) = transport layer.
 */
@Injectable()
export class AmazonConnector extends PayloadConnector {
  constructor(mapper: ObjectMapper, registry: ConnectorRegistry) {
    super('amazon', mapper, registry);
  }

  descriptor(): ConnectorDescriptor {
    return { id: 'amazon', kind: 'connector', class: 'ecommerce', name: 'Amazon (SP-API)', description: 'Amazon Selling Partner API orders/feeds' };
  }
}

/** Starter template (SP-API order → canonical 850). Verify against the live SP-API schema/version. */
export const AMAZON_ORDER_TEMPLATE: ConnectorMap = {
  connector: 'amazon', docType: '850', direction: 'inbound',
  header: [
    { to: 'poNumber', from: 'AmazonOrderId' },
    { to: 'poDate', from: 'PurchaseDate' },
  ],
  lineTo: 'lineItems', lineOver: 'OrderItems',
  lineFields: [
    { to: 'ids.0.value', from: 'SellerSKU' },
    { to: 'quantity.value', from: 'QuantityOrdered', decimal: 0 },
    { to: 'unitPrice.amount', from: 'ItemPrice.Amount', decimal: 2 },
  ],
};
