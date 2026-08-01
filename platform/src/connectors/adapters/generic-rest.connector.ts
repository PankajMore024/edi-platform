import { Injectable } from '@nestjs/common';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorDescriptor } from '../connector.types';
import { PayloadConnector } from './payload-connector.base';

/** Generic REST/webhook connector — the escape hatch for any JSON API without a bespoke adapter. */
@Injectable()
export class GenericRestConnector extends PayloadConnector {
  constructor(mapper: ObjectMapper, registry: ConnectorRegistry) {
    super('generic-rest', mapper, registry);
  }

  descriptor(): ConnectorDescriptor {
    return { id: 'generic-rest', kind: 'connector', class: 'api', name: 'Generic REST / webhook', description: 'Configurable JSON API/webhook' };
  }
}
