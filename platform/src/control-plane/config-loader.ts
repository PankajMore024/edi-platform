import { Injectable } from '@nestjs/common';
import { MapRegistry } from './map-registry';
import { SpecRegistry } from './spec-registry';
import { ConnectorInstanceStore } from './connector-instance-store';
import { RelationshipStore } from './relationship-store';
import { DocSpecRepository, PartnerMapRepository } from '../db/repositories/config-repositories';
import { ConnectorInstanceRepository } from '../db/repositories/connector-instance.repository';
import { RelationshipRepository } from '../db/repositories/relationship.repository';

/**
 * The config read-cache bridge. The translate hot path reads config SYNCHRONOUSLY from the in-memory
 * registries (MapRegistry/SpecRegistry/ConnectorInstanceStore/RelationshipStore); those are the durable
 * caller-facing cache. This loads a tenant's API-provisioned config from the durable repos INTO those
 * registries, so the pipeline sees what was configured — without making the hot path async. Call it on
 * tenant activation / after provisioning changes; a receive then reads warm config.
 */
@Injectable()
export class ConfigLoader {
  constructor(
    private readonly maps: MapRegistry,
    private readonly specs: SpecRegistry,
    private readonly instances: ConnectorInstanceStore,
    private readonly relationships: RelationshipStore,
    private readonly specRepo: DocSpecRepository,
    private readonly partnerMapRepo: PartnerMapRepository,
    private readonly connectorRepo: ConnectorInstanceRepository,
    private readonly relRepo: RelationshipRepository,
  ) {}

  /** Load all of a tenant's config from the DB into the in-memory registries. */
  async hydrate(tenantId: string): Promise<void> {
    for (const { id, spec } of await this.specRepo.list(tenantId)) this.specs.register(id, spec);
    for (const { id, map } of await this.partnerMapRepo.list(tenantId)) this.maps.register(id, map);
    for (const summary of await this.connectorRepo.listByTenant(tenantId)) {
      const inst = await this.connectorRepo.get(tenantId, summary.id);
      if (inst) this.instances.upsert(inst);
    }
    for (const rel of await this.relRepo.listByTenant(tenantId)) this.relationships.upsert(rel);
  }
}
