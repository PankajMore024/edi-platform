import { Injectable } from '@nestjs/common';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorDescriptor, ConnectorMap } from '../connector.types';
import { PayloadConnector } from './payload-connector.base';

/**
 * Shopify connector (e-commerce). Translation is generic (object-mapper); ships a starter template
 * for a Shopify order → canonical. LIVE fetch (Admin API / order webhooks) + OAuth = transport layer.
 */
@Injectable()
export class ShopifyConnector extends PayloadConnector {
  constructor(mapper: ObjectMapper, registry: ConnectorRegistry) {
    super('shopify', mapper, registry);
  }

  descriptor(): ConnectorDescriptor {
    return { id: 'shopify', kind: 'connector', class: 'ecommerce', name: 'Shopify', description: 'Shopify Admin API / order webhooks' };
  }
}

/** Starter template (Shopify order → canonical 850). Verify against the live Admin API schema/version. */
export const SHOPIFY_ORDER_TEMPLATE: ConnectorMap = {
  connector: 'shopify', docType: '850', direction: 'inbound',
  header: [
    { to: 'poNumber', from: 'name' },
    { to: 'poDate', from: 'created_at' },
  ],
  lineTo: 'lineItems', lineOver: 'line_items',
  lineFields: [
    { to: 'ids.0.value', from: 'sku' },
    { to: 'quantity.value', from: 'quantity', decimal: 0 },
    { to: 'unitPrice.amount', from: 'price', decimal: 2 },
  ],
};
