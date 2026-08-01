import { Injectable } from '@nestjs/common';
import { ComponentDescriptor, TradingRelationship } from './config.types';

/**
 * Store of configured trading relationships. In-memory now; a DB table in the product. Because a
 * TradingRelationship is fully declarative, the admin console reads/writes exactly these objects.
 */
@Injectable()
export class RelationshipStore {
  private readonly relationships = new Map<string, TradingRelationship>();

  upsert(rel: TradingRelationship): void {
    this.relationships.set(rel.id, rel);
  }

  get(id: string): TradingRelationship {
    const r = this.relationships.get(id);
    if (!r) throw new Error(`relationship not found: "${id}"`);
    return r;
  }

  list(): ComponentDescriptor[] {
    return [...this.relationships.values()].map((r) => ({
      id: r.id,
      kind: 'relationship',
      name: r.partnerName ?? r.partnerId,
      description: `${r.tenantRole} · ${r.formatAuthority}-authoritative · ${r.version}`,
    }));
  }
}
