import { Injectable } from '@nestjs/common';
import { Connector, ConnectorDescriptor } from './connector.types';

/**
 * Registry of connector TYPES. Connectors self-register (constructor calls `register(this)`), so
 * adding a connector = adding a module — no changes here. `list()` exposes descriptors for the admin
 * console's component palette. The control plane resolves connectors by type via this registry only,
 * never depending on a concrete connector.
 */
@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    this.connectors.set(connector.type, connector);
  }

  get(type: string): Connector {
    const c = this.connectors.get(type);
    if (!c) throw new Error(`connector type not registered: "${type}"`);
    return c;
  }

  list(): ConnectorDescriptor[] {
    return [...this.connectors.values()].map((c) => c.descriptor());
  }
}
