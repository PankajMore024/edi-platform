import { Injectable } from '@nestjs/common';
import { ConnectorInstance } from '../connectors/connector.types';
import { ComponentDescriptor } from './config.types';

/**
 * Store of configured connector INSTANCES (a client's flat-file with its parse-config + connector-map,
 * etc.) — distinct from the ConnectorRegistry, which holds connector TYPES (code). In-memory now; a DB
 * table in the product. Declarative config; the console reads/writes these.
 */
@Injectable()
export class ConnectorInstanceStore {
  private readonly instances = new Map<string, ConnectorInstance>();

  upsert(instance: ConnectorInstance): void {
    this.instances.set(instance.id, instance);
  }

  get(id: string): ConnectorInstance {
    const i = this.instances.get(id);
    if (!i) throw new Error(`connector instance not found: "${id}"`);
    return i;
  }

  list(): ComponentDescriptor[] {
    return [...this.instances.values()].map((i) => ({
      id: i.id,
      kind: 'connector',
      name: `${i.connectorType} (${i.id})`,
    }));
  }
}
