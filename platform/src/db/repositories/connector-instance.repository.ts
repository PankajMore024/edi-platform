import { randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import { ConnectorInstance } from '../../connectors/connector.types';

/**
 * Durable store for a client-system connector instance + its connector map. The instance scalars live
 * in `connector_instance` (settings JSON, vault_ref, trigger); its map lives in `connector_map`
 * (rewritten on save). `docTypes` is derived from the map(s) on read. This is where the sample-import
 * output persists as reusable master config.
 */
export class ConnectorInstanceRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async save(inst: ConnectorInstance): Promise<void> {
    const ts = new Date().toISOString();
    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('connector_instance')
        .values({
          id: inst.id, tenant_id: inst.tenantId, connector_type: inst.connectorType, name: inst.connectorType,
          settings: JSON.stringify(inst.settings ?? {}), vault_ref: inst.auth?.vaultRef ?? null, trigger: inst.trigger, created_at: ts,
        })
        .onConflict((oc) => oc.column('id').doUpdateSet({
          connector_type: inst.connectorType, settings: JSON.stringify(inst.settings ?? {}), vault_ref: inst.auth?.vaultRef ?? null, trigger: inst.trigger,
        }))
        .execute();

      await trx.deleteFrom('connector_map').where('connector_instance_id', '=', inst.id).execute();
      await trx.insertInto('connector_map').values({
        id: randomUUID(), tenant_id: inst.tenantId, connector_instance_id: inst.id,
        doc_type: inst.connectorMap.docType, direction: inst.connectorMap.direction, definition: JSON.stringify(inst.connectorMap), version_no: 1, created_at: ts,
      }).execute();
    });
  }

  async get(tenantId: string, id: string): Promise<ConnectorInstance | undefined> {
    const r = await this.db.selectFrom('connector_instance').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!r) return undefined;
    const maps = await this.db.selectFrom('connector_map').select(['doc_type', 'definition']).where('connector_instance_id', '=', id).execute();
    return {
      id: r.id, tenantId: r.tenant_id, connectorType: r.connector_type,
      auth: r.vault_ref ? { vaultRef: r.vault_ref } : undefined, settings: JSON.parse(r.settings),
      connectorMap: JSON.parse(maps[0]?.definition ?? '{}'), docTypes: maps.map((m) => m.doc_type) as ConnectorInstance['docTypes'],
      trigger: r.trigger as ConnectorInstance['trigger'],
    };
  }

  /** Remove an instance and its connector map. Returns false if it wasn't there (or wrong tenant). */
  async delete(tenantId: string, id: string): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const r = await trx.deleteFrom('connector_instance').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
      await trx.deleteFrom('connector_map').where('tenant_id', '=', tenantId).where('connector_instance_id', '=', id).execute();
      return Number(r.numDeletedRows ?? 0) > 0;
    });
  }

  async listByTenant(tenantId: string): Promise<Array<{ id: string; connectorType: string; trigger: string; docTypes: string[] }>> {
    const rows = await this.db.selectFrom('connector_instance').select(['id', 'connector_type', 'trigger']).where('tenant_id', '=', tenantId).execute();
    const out = [];
    for (const row of rows) {
      const maps = await this.db.selectFrom('connector_map').select('doc_type').where('connector_instance_id', '=', row.id).execute();
      out.push({ id: row.id, connectorType: row.connector_type, trigger: row.trigger, docTypes: maps.map((m) => m.doc_type) });
    }
    return out;
  }
}
