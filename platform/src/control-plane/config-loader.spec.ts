import { Kysely } from 'kysely';
import { createDatabase } from '../db/database';
import { createSchema } from '../db/migrations';
import { DB } from '../db/schema';
import { ConfigLoader } from './config-loader';
import { MapRegistry } from './map-registry';
import { SpecRegistry } from './spec-registry';
import { ConnectorInstanceStore } from './connector-instance-store';
import { RelationshipStore } from './relationship-store';
import { MapValidator } from '../mapping/dsl/map-validator';
import { DocSpecRepository, PartnerMapRepository } from '../db/repositories/config-repositories';
import { ConnectorInstanceRepository } from '../db/repositories/connector-instance.repository';
import { RelationshipRepository } from '../db/repositories/relationship.repository';
import { HOUSE_850 } from '../validation/specs/house850';
import { SAMPLE_MAP } from '../testing/fixtures';
import { TradingRelationship } from './config.types';
import { ConnectorInstance } from '../connectors/connector.types';
import { EdiMap } from '../mapping/dsl/map.types';

describe('ConfigLoader (durable config → in-memory registries the pipeline reads)', () => {
  it('hydrates a tenant’s specs, maps, connectors, and relationships from the DB', async () => {
    const db: Kysely<DB> = createDatabase({ sqliteFile: ':memory:' });
    await createSchema(db);

    // provision config in the durable repos (as the API would)
    await new DocSpecRepository(db).save('t1', 'house-850', HOUSE_850);
    await new PartnerMapRepository(db).save('t1', 'm-in', { ...SAMPLE_MAP, direction: 'inbound' } as EdiMap);
    const inst: ConnectorInstance = {
      id: 'ci', tenantId: 't1', connectorType: 'csv', settings: { hasHeader: true }, docTypes: ['850'], trigger: 'file-drop',
      connectorMap: { connector: 'csv', docType: '850', direction: 'inbound', header: [{ to: 'poNumber', from: 'PO' }] },
    };
    await new ConnectorInstanceRepository(db).save(inst);
    const rel: TradingRelationship = {
      id: 'rel', tenantId: 't1', partnerId: 'acme', formatAuthority: 'client', tenantRole: 'buyer', version: '004010', mode: 'test',
      envelope: { senderQualifier: 'ZZ', senderId: 'ACME', receiverQualifier: 'ZZ', receiverId: 'RET', gsVersion: '004010' },
      documents: [{ docType: '850', direction: 'inbound', mapId: 'm-in', specId: 'house-850', connectorInstanceId: 'ci', enabled: true }],
      active: true,
    };
    await new RelationshipRepository(db).save(rel);

    // fresh, empty registries (what the translate hot path reads)
    const maps = new MapRegistry(new MapValidator());
    const specs = new SpecRegistry();
    const instances = new ConnectorInstanceStore();
    const relationships = new RelationshipStore();
    const loader = new ConfigLoader(maps, specs, instances, relationships,
      new DocSpecRepository(db), new PartnerMapRepository(db), new ConnectorInstanceRepository(db), new RelationshipRepository(db));

    await loader.hydrate('t1');

    // the registries the pipeline reads synchronously now return the API-provisioned config
    expect(specs.get('house-850').docType).toBe('850');
    expect(maps.get('m-in').direction).toBe('inbound');
    expect(instances.get('ci').connectorType).toBe('csv');
    expect(relationships.get('rel').partnerId).toBe('acme');

    await db.destroy();
  });
});
