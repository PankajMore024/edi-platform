import { Injectable } from '@nestjs/common';
import { EdiMap } from '../mapping/dsl/map.types';
import { MapValidator } from '../mapping/dsl/map-validator';
import { ComponentDescriptor } from './config.types';

/**
 * Registry of partner maps, keyed by id. In-memory now; a DB table (`edi_map`) in the product.
 * Every map is Layer-1 validated on register — a malformed map never enters the registry. `list()`
 * exposes catalog descriptors for the admin console's component library.
 */
@Injectable()
export class MapRegistry {
  private readonly maps = new Map<string, EdiMap>();

  constructor(private readonly validator: MapValidator) {}

  register(id: string, map: EdiMap): void {
    this.validator.assertValid(map);
    this.maps.set(id, map);
  }

  get(id: string): EdiMap {
    const m = this.maps.get(id);
    if (!m) throw new Error(`map not found in registry: "${id}"`);
    return m;
  }

  list(): ComponentDescriptor[] {
    return [...this.maps.entries()].map(([id, m]) => ({
      id,
      kind: 'map',
      name: `${m.partner} · ${m.docType} · ${m.direction}${m.version ? ` · ${m.version}` : ''}`,
    }));
  }
}
