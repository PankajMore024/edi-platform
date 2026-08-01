import { Injectable } from '@nestjs/common';
import { DocSpec } from '../validation/spec.types';
import { ComponentDescriptor } from './config.types';

/**
 * Registry of conformance specs (house specs + imported partner IGs), keyed by id. In-memory now;
 * a DB table (`spec`) in the product. `owner` on the spec records client- vs partner-authored.
 */
@Injectable()
export class SpecRegistry {
  private readonly specs = new Map<string, DocSpec>();

  register(id: string, spec: DocSpec): void {
    this.specs.set(id, spec);
  }

  get(id: string): DocSpec {
    const s = this.specs.get(id);
    if (!s) throw new Error(`spec not found in registry: "${id}"`);
    return s;
  }

  list(): ComponentDescriptor[] {
    return [...this.specs.entries()].map(([id, s]) => ({
      id,
      kind: 'spec',
      name: s.name ?? `${s.docType} ${s.version}`,
      description: `owner: ${s.owner}`,
    }));
  }
}
