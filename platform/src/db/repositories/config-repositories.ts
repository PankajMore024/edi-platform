import { Kysely } from 'kysely';
import { DB } from '../schema';
import { DocSpec } from '../../validation/spec.types';
import { EdiMap } from '../../mapping/dsl/map.types';
import { ConnectorMap } from '../../connectors/connector.types';
import { TransportInstance } from '../../transport/transport.types';

/**
 * Durable config repositories for the "flat" master-config objects — a spec / map / transport is a
 * versioned definition, so it's stored as promoted lookup columns (doc_type, direction, version) + the
 * full object as a JSON `definition`. Reconstructed verbatim on read. (Relationship + connector-instance,
 * which have nested/child structure, are their own repos.)
 */

const now = (): string => new Date().toISOString();

/** doc_spec — conformance IG (house or partner), keyed by id, referenced from relationship_document. */
export class DocSpecRepository {
  constructor(private readonly db: Kysely<DB>) {}
  async save(tenantId: string, id: string, spec: DocSpec): Promise<void> {
    await this.db.insertInto('doc_spec')
      .values({ id, tenant_id: tenantId, doc_type: spec.docType, version: spec.version, owner: spec.owner, definition: JSON.stringify(spec), created_at: now() })
      .onConflict((oc) => oc.column('id').doUpdateSet({ doc_type: spec.docType, version: spec.version, owner: spec.owner, definition: JSON.stringify(spec) }))
      .execute();
  }
  async get(tenantId: string, id: string): Promise<DocSpec | undefined> {
    const r = await this.db.selectFrom('doc_spec').select('definition').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return r ? (JSON.parse(r.definition) as DocSpec) : undefined;
  }
  async list(tenantId: string): Promise<Array<{ id: string; spec: DocSpec }>> {
    const rows = await this.db.selectFrom('doc_spec').select(['id', 'definition']).where('tenant_id', '=', tenantId).execute();
    return rows.map((r) => ({ id: r.id, spec: JSON.parse(r.definition) as DocSpec }));
  }
}

/** partner_map — X12 ⇄ canonical DSL (per relationship/doc). */
export class PartnerMapRepository {
  constructor(private readonly db: Kysely<DB>) {}
  async save(tenantId: string, id: string, map: EdiMap): Promise<void> {
    await this.db.insertInto('partner_map')
      .values({ id, tenant_id: tenantId, doc_type: map.docType, direction: map.direction, definition: JSON.stringify(map), version_no: 1, created_at: now() })
      .onConflict((oc) => oc.column('id').doUpdateSet({ doc_type: map.docType, direction: map.direction, definition: JSON.stringify(map) }))
      .execute();
  }
  async get(tenantId: string, id: string): Promise<EdiMap | undefined> {
    const r = await this.db.selectFrom('partner_map').select('definition').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return r ? (JSON.parse(r.definition) as EdiMap) : undefined;
  }
  async list(tenantId: string): Promise<Array<{ id: string; map: EdiMap }>> {
    const rows = await this.db.selectFrom('partner_map').select(['id', 'definition']).where('tenant_id', '=', tenantId).execute();
    return rows.map((r) => ({ id: r.id, map: JSON.parse(r.definition) as EdiMap }));
  }
}

/** connector_map — client-system ⇄ canonical (what sample-import generates), keyed by (connector, doc). */
export class ConnectorMapRepository {
  constructor(private readonly db: Kysely<DB>) {}
  async save(tenantId: string, id: string, connectorInstanceId: string, map: ConnectorMap): Promise<void> {
    await this.db.insertInto('connector_map')
      .values({ id, tenant_id: tenantId, connector_instance_id: connectorInstanceId, doc_type: map.docType, direction: map.direction, definition: JSON.stringify(map), version_no: 1, created_at: now() })
      .onConflict((oc) => oc.column('id').doUpdateSet({ doc_type: map.docType, direction: map.direction, definition: JSON.stringify(map) }))
      .execute();
  }
  async get(tenantId: string, id: string): Promise<ConnectorMap | undefined> {
    const r = await this.db.selectFrom('connector_map').select('definition').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return r ? (JSON.parse(r.definition) as ConnectorMap) : undefined;
  }
  /** All maps for a client-system connector — the reused-across-partners library view. */
  async listForConnector(tenantId: string, connectorInstanceId: string): Promise<Array<{ id: string; map: ConnectorMap }>> {
    const rows = await this.db.selectFrom('connector_map').select(['id', 'definition'])
      .where('tenant_id', '=', tenantId).where('connector_instance_id', '=', connectorInstanceId).execute();
    return rows.map((r) => ({ id: r.id, map: JSON.parse(r.definition) as ConnectorMap }));
  }
}

/** transport_instance — endpoint config (creds via vault_ref). */
export class TransportInstanceRepository {
  constructor(private readonly db: Kysely<DB>) {}
  async save(inst: TransportInstance): Promise<void> {
    await this.db.insertInto('transport_instance')
      .values({ id: inst.id, tenant_id: inst.tenantId, transport_type: inst.transportType, settings: JSON.stringify(inst.settings), vault_ref: inst.vaultRef ?? null, direction: inst.direction, created_at: now() })
      .onConflict((oc) => oc.column('id').doUpdateSet({ transport_type: inst.transportType, settings: JSON.stringify(inst.settings), vault_ref: inst.vaultRef ?? null, direction: inst.direction }))
      .execute();
  }
  async get(tenantId: string, id: string): Promise<TransportInstance | undefined> {
    const r = await this.db.selectFrom('transport_instance').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return r ? { id: r.id, tenantId: r.tenant_id, transportType: r.transport_type, settings: JSON.parse(r.settings), vaultRef: r.vault_ref ?? undefined, direction: r.direction as TransportInstance['direction'] } : undefined;
  }
  async list(tenantId: string): Promise<TransportInstance[]> {
    const rows = await this.db.selectFrom('transport_instance').selectAll().where('tenant_id', '=', tenantId).execute();
    return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, transportType: r.transport_type, settings: JSON.parse(r.settings), vaultRef: r.vault_ref ?? undefined, direction: r.direction as TransportInstance['direction'] }));
  }
}
