import { CanonicalDocument } from '../../canonical/types/document.types';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { Connector, ConnectorDescriptor, ConnectorInstance } from '../connector.types';

/**
 * Base for JSON-payload connectors (e-commerce / API / ERP). The payload is already an object;
 * translation is the generic ObjectMapper (native ⇄ canonical). Subclasses add only the platform
 * identity + a shipped default connector-map template.
 *
 * ⚠️ LIVE fetch/deliver + OAuth are the TRANSPORT layer (real credentials/SDKs) — NOT here. These
 * adapters translate a PROVIDED payload; wiring them to live Shopify/Amazon/QuickBooks APIs is a
 * separate, credential-dependent step and cannot be certified without accounts.
 */
export abstract class PayloadConnector implements Connector {
  abstract descriptor(): ConnectorDescriptor;

  // `type` is a parameter property (assigned BEFORE the body), so `this.type` is set when we
  // register — subclass field initializers run after super(), which would leave it undefined.
  constructor(
    readonly type: string,
    protected readonly mapper: ObjectMapper,
    registry: ConnectorRegistry,
  ) {
    registry.register(this);
  }

  async ingest(raw: unknown, instance: ConnectorInstance): Promise<CanonicalDocument[]> {
    if (raw === null || typeof raw !== 'object') {
      throw new Error(`${this.type} connector expects a JSON object payload`);
    }
    const doc = this.mapper.ingest(raw, instance.connectorMap) as any;
    doc.meta.tenantId = instance.tenantId;
    return [doc];
  }

  async emitData(doc: CanonicalDocument, instance: ConnectorInstance): Promise<unknown> {
    return this.mapper.emit(doc, instance.connectorMap);
  }
}
