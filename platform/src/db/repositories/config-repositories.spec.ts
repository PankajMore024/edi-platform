import { Kysely } from 'kysely';
import { createDatabase } from '../database';
import { createSchema } from '../migrations';
import { DB } from '../schema';
import { ControlNumberRepository } from './control-number.repository';
import { RelationshipRepository } from './relationship.repository';
import { DocSpecRepository, ConnectorMapRepository, TransportInstanceRepository } from './config-repositories';
import { TradingRelationship } from '../../control-plane/config.types';
import { HOUSE_850 } from '../../validation/specs/house850';
import { ConnectorMap } from '../../connectors/connector.types';
import { TransportInstance } from '../../transport/transport.types';

describe('config repositories (durable master config, node:sqlite)', () => {
  let db: Kysely<DB>;
  beforeEach(async () => { db = createDatabase({ sqliteFile: ':memory:' }); await createSchema(db); });
  afterEach(async () => { await db.destroy(); });

  describe('ControlNumberRepository', () => {
    it('allocates monotonic, per-(tenant,scope) numbers atomically', async () => {
      const repo = new ControlNumberRepository(db);
      expect(await repo.next('t1', 'rel:isa')).toBe('1');
      expect(await repo.next('t1', 'rel:isa')).toBe('2');
      expect(await repo.next('t1', 'rel:gs')).toBe('1'); // independent scope
      expect(await repo.next('t2', 'rel:isa')).toBe('1'); // independent tenant
      expect(await repo.nextPadded('t1', 'rel:isa', 9)).toBe('000000003');
    });

    it('is atomic under concurrent allocation — no duplicates', async () => {
      const repo = new ControlNumberRepository(db);
      const results = await Promise.all(Array.from({ length: 20 }, () => repo.next('t1', 'concurrent')));
      expect(new Set(results).size).toBe(20); // all distinct
      expect(results.map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });
  });

  describe('RelationshipRepository', () => {
    const rel: TradingRelationship = {
      id: 'rel', tenantId: 't1', partnerId: 'acme', formatAuthority: 'client', tenantRole: 'buyer',
      version: '004010', mode: 'test',
      envelope: { senderQualifier: 'ZZ', senderId: 'ACME', receiverQualifier: 'ZZ', receiverId: 'RET', gsVersion: '004010' },
      documents: [
        { docType: '850', direction: 'inbound', mapId: 'm-in', specId: 'house-850', connectorInstanceId: 'ci', enabled: true },
        { docType: '810', direction: 'outbound', mapId: 'm-out', specId: 'house-810', connectorInstanceId: 'ci', enabled: false },
      ],
      active: true,
    };

    it('round-trips the relationship + its document bindings', async () => {
      const repo = new RelationshipRepository(db);
      await repo.save(rel);
      expect(await repo.get('t1', 'rel')).toEqual(rel);
      expect(await repo.get('t2', 'rel')).toBeUndefined(); // tenant-scoped
    });

    it('save replaces the documents set (no orphans on update)', async () => {
      const repo = new RelationshipRepository(db);
      await repo.save(rel);
      await repo.save({ ...rel, documents: [rel.documents[0]] }); // drop the 810
      expect((await repo.get('t1', 'rel'))!.documents).toHaveLength(1);
    });
  });

  it('spec / connector-map / transport round-trip verbatim', async () => {
    const specs = new DocSpecRepository(db);
    await specs.save('t1', 'house-850', HOUSE_850);
    expect(await specs.get('t1', 'house-850')).toEqual(HOUSE_850);

    const cmaps = new ConnectorMapRepository(db);
    const cmap: ConnectorMap = { connector: 'csv', docType: '850', direction: 'inbound', header: [{ to: 'poNumber', from: 'PO' }] };
    await cmaps.save('t1', 'cm1', 'ci', cmap);
    expect(await cmaps.get('t1', 'cm1')).toEqual(cmap);
    expect((await cmaps.listForConnector('t1', 'ci')).map((x) => x.id)).toEqual(['cm1']);

    const transports = new TransportInstanceRepository(db);
    const inst: TransportInstance = { id: 'tp1', tenantId: 't1', transportType: 'sftp', settings: { host: 'x' }, vaultRef: 'vault://1', direction: 'both' };
    await transports.save(inst);
    expect(await transports.get('t1', 'tp1')).toEqual(inst);
  });
});
