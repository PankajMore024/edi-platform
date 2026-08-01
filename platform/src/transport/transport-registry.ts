import { Injectable } from '@nestjs/common';
import { TransportAdapter, TransportDescriptor } from './transport.types';

/**
 * Registry of transport TYPES. Transports self-register (constructor calls `register(this)`), so
 * adding a transport = adding a module. `list()` exposes descriptors for the admin console's palette —
 * the console shows transports alongside connectors, distinguished by `kind`.
 */
@Injectable()
export class TransportRegistry {
  private readonly transports = new Map<string, TransportAdapter>();

  register(transport: TransportAdapter): void {
    this.transports.set(transport.type, transport);
  }

  get(type: string): TransportAdapter {
    const t = this.transports.get(type);
    if (!t) throw new Error(`transport type not registered: "${type}"`);
    return t;
  }

  list(): TransportDescriptor[] {
    return [...this.transports.values()].map((t) => t.descriptor());
  }
}
