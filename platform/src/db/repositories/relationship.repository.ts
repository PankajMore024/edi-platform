import { randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import type { TradingRelationship, RelationshipDocument, FormatAuthority } from '../../control-plane/config.types';
import type { DocType, Direction } from '../../mapping/dsl/map.types';
import type { EnvelopeConfig } from '../../envelope/envelope.service';

/**
 * Durable store for the central config object — a trading relationship + its per-document bindings. The
 * header is one `trading_relationship` row (envelope stored as JSON); the `documents[]` are child
 * `relationship_document` rows, rewritten atomically on save so the set always matches the aggregate.
 */
export class RelationshipRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async save(rel: TradingRelationship): Promise<void> {
    const ts = new Date().toISOString();
    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('trading_relationship')
        .values({
          id: rel.id, tenant_id: rel.tenantId, partner_id: rel.partnerId, mode: rel.mode,
          format_authority: rel.formatAuthority, tenant_role: rel.tenantRole, version: rel.version,
          envelope: JSON.stringify(rel.envelope), active: rel.active ? 1 : 0, version_no: 1, created_at: ts, updated_at: ts,
        })
        .onConflict((oc) => oc.column('id').doUpdateSet({
          partner_id: rel.partnerId, mode: rel.mode, format_authority: rel.formatAuthority, tenant_role: rel.tenantRole,
          version: rel.version, envelope: JSON.stringify(rel.envelope), active: rel.active ? 1 : 0, updated_at: ts,
        }))
        .execute();

      // documents[] is an owned set — replace it wholesale so it always matches the aggregate.
      await trx.deleteFrom('relationship_document').where('relationship_id', '=', rel.id).execute();
      for (const d of rel.documents) {
        await trx.insertInto('relationship_document').values({
          id: randomUUID(), relationship_id: rel.id, doc_type: d.docType, direction: d.direction,
          spec_id: d.specId ?? null, partner_map_id: d.mapId ?? null, connector_instance_id: d.connectorInstanceId ?? null,
          enabled: d.enabled ? 1 : 0,
        }).execute();
      }
    });
  }

  async get(tenantId: string, id: string): Promise<TradingRelationship | undefined> {
    const r = await this.db.selectFrom('trading_relationship').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!r) return undefined;
    const docs = await this.db.selectFrom('relationship_document').selectAll().where('relationship_id', '=', id).execute();
    return {
      id: r.id, tenantId: r.tenant_id, partnerId: r.partner_id, mode: r.mode as TradingRelationship['mode'],
      formatAuthority: r.format_authority as FormatAuthority, tenantRole: r.tenant_role as TradingRelationship['tenantRole'],
      version: r.version, envelope: JSON.parse(r.envelope) as EnvelopeConfig, active: r.active === 1,
      documents: docs.map((d): RelationshipDocument => ({
        docType: d.doc_type as DocType, direction: d.direction as Direction,
        mapId: d.partner_map_id ?? '', specId: d.spec_id ?? undefined, connectorInstanceId: d.connector_instance_id ?? undefined,
        enabled: d.enabled === 1,
      })),
    };
  }

  async listByTenant(tenantId: string): Promise<TradingRelationship[]> {
    const rows = await this.db.selectFrom('trading_relationship').select('id').where('tenant_id', '=', tenantId).execute();
    const out: TradingRelationship[] = [];
    for (const row of rows) { const rel = await this.get(tenantId, row.id); if (rel) out.push(rel); }
    return out;
  }
}
