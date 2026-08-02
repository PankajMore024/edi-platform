import { Kysely } from 'kysely';
import { InboundPipeline } from './inbound-pipeline';
import { IntegrationOrchestrator } from './integration-orchestrator';
import { TranslationPipeline } from './translation-pipeline';
import { ConnectorInstanceStore } from './connector-instance-store';
import { MapRegistry } from './map-registry';
import { SpecRegistry } from './spec-registry';
import { TradingRelationship } from './config.types';
import { ConnectorRegistry } from '../connectors/connector-registry';
import { ObjectMapper } from '../connectors/object-mapper';
import { CsvConnector } from '../connectors/adapters/csv.connector';
import { ConnectorInstance } from '../connectors/connector.types';
import { EmitService } from '../mapping/engine/emit.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EnvelopeService } from '../envelope/envelope.service';
import { InMemoryControlNumberService } from '../envelope/control-number.service';
import { ConformanceValidator } from '../validation/conformance-validator';
import { MapValidator } from '../mapping/dsl/map-validator';
import { X12Service } from '../x12/x12.service';
import { HOUSE_850 } from '../validation/specs/house850';
import { SAMPLE_MAP } from '../testing/fixtures';
import { EdiMap } from '../mapping/dsl/map.types';
import { InboundGateway } from '../intake/inbound-gateway';
import { FunctionalAckService } from '../ack/functional-ack.service';
import { DB } from '../db/schema';
import { createDatabase } from '../db/database';
import { createSchema } from '../db/migrations';
import { RawArtifactRepository } from '../db/repositories/raw-artifact.repository';
import { DedupRepository } from '../db/repositories/dedup.repository';
import { ProcessingRepository } from '../db/repositories/processing.repository';
import { TransactionRepository } from '../db/repositories/transaction.repository';
import { DbLifecycleSink } from '../db/repositories/lifecycle-sink.repository';
import { sql } from 'kysely';

/**
 * Slice-2 integration: the live InboundPipeline running against the DURABLE Kysely repositories
 * (real node:sqlite), proving the whole receive loop persists to the DB — retention, dedup, and the
 * lifecycle event — not just the in-memory path.
 */
describe('InboundPipeline on durable repositories (node:sqlite)', () => {
  const x12 = new X12Service();
  const envelope = new EnvelopeService();
  const at = new Date('2026-08-02T09:05:00Z');
  const csv = 'PO,Date,Line,SKU,Qty,UOM,Price\n4500,2026-07-31,1,012345678905,10,EA,18.50\n';

  const instance: ConnectorInstance = {
    id: 'ci', tenantId: 't1', connectorType: 'csv', settings: { hasHeader: true },
    docTypes: ['850'], trigger: 'file-drop',
    connectorMap: {
      connector: 'csv', docType: '850', direction: 'inbound',
      header: [{ to: 'poNumber', from: 'PO' }, { to: 'poDate', from: 'Date' }],
      lineTo: 'lineItems',
      lineFields: [
        { to: 'lineNumber', from: 'Line' }, { to: 'ids.0.value', from: 'SKU' },
        { to: 'quantity.value', from: 'Qty', decimal: 0 }, { to: 'quantity.uom', from: 'UOM' },
        { to: 'unitPrice.amount', from: 'Price', decimal: 2 },
      ],
    },
  };
  const rel: TradingRelationship = {
    id: 'rel', tenantId: 't1', partnerId: 'acme', formatAuthority: 'client', tenantRole: 'buyer',
    version: '004010', mode: 'test',
    envelope: { senderQualifier: 'ZZ', senderId: 'ACME', receiverQualifier: 'ZZ', receiverId: 'RET', gsVersion: '004010' },
    documents: [
      { docType: '850', direction: 'outbound', mapId: 'm-out', specId: 'house-850', connectorInstanceId: 'ci', enabled: true },
      { docType: '850', direction: 'inbound', mapId: 'm-in', specId: 'house-850', connectorInstanceId: 'ci', enabled: true },
    ],
    active: true,
  };

  let db: Kysely<DB>;
  let inbound: InboundPipeline;
  let orch: IntegrationOrchestrator;
  let ledger: ProcessingRepository;
  let raw: RawArtifactRepository;
  let txns: TransactionRepository;

  beforeEach(async () => {
    db = createDatabase({ sqliteFile: ':memory:' });
    await createSchema(db);
    const maps = new MapRegistry(new MapValidator());
    maps.register('m-out', SAMPLE_MAP);
    maps.register('m-in', { ...SAMPLE_MAP, direction: 'inbound' } as EdiMap);
    const specs = new SpecRegistry(); specs.register('house-850', HOUSE_850);
    const connectors = new ConnectorRegistry(); new CsvConnector(new ObjectMapper(), connectors);
    const instances = new ConnectorInstanceStore(); instances.upsert(instance);
    const controlNumbers = new InMemoryControlNumberService();
    const pipeline = new TranslationPipeline(new EmitService(), new IngestService(), envelope, controlNumbers, new ConformanceValidator(), maps, specs);
    orch = new IntegrationOrchestrator(pipeline, connectors, instances);
    raw = new RawArtifactRepository(db); ledger = new ProcessingRepository(db); txns = new TransactionRepository(db);
    const gateway = new InboundGateway(raw, new DedupRepository(db), x12);
    inbound = new InboundPipeline(gateway, x12, pipeline, orch, new FunctionalAckService(), envelope, controlNumbers, ledger, txns, new DbLifecycleSink(db));
  });
  afterEach(async () => { await db.destroy(); });

  const validEdi = async () => x12.serialize((await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange);

  it('persists retention + a lifecycle event to the DB on accept', async () => {
    const r = await inbound.receive(rel, 'sftp:acme', await validEdi(), at);
    expect(r.outcome).toBe('accepted');

    // the lifecycle event is durably in the DB
    const events = await ledger.list({ tenantId: 't1' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'accepted', delivered: true, docType: '850' });
    // the raw bytes are retained and retrievable by content hash
    expect(await raw.get('t1', r.transactions[0].event.artifactId)).toBeDefined();

    // the transaction itself is persisted as normalized rows, linked from the event, and reconstructs
    const txnId = r.transactions[0].event.transactionId!;
    const stored = await txns.get('t1', txnId);
    expect(stored).toMatchObject({ docType: '850', currentState: 'DELIVERED', conformant: true, poNumber: '4500' });
    const canon = stored!.canonical as any;
    expect(canon.poNumber).toBe('4500');
    expect(canon.lineItems).toHaveLength(1);
    expect(canon.lineItems[0]).toMatchObject({ quantity: { value: 10, uom: 'EA' }, unitPrice: { amount: 18.5 } });
    expect(canon.lineItems[0].ids[0].value).toBe('012345678905');
    // queryable for dashboards without touching a blob
    expect((await txns.list('t1', { state: 'DELIVERED' })).map((t) => t.poNumber)).toEqual(['4500']);

    // the write-side lifecycle rows are all persisted: interchange, 997, delivery, and a queued dispatch
    const count = async (t: string) => Number((await sql<{ n: number }>`select count(*) as n from ${sql.ref(t)}`.execute(db)).rows[0].n);
    expect(await count('interchange')).toBe(1);
    expect(await count('acknowledgment')).toBe(1);
    expect(await count('delivery')).toBe(1);
    expect(await count('dispatch_queue')).toBe(1); // 997 queued for outbound send
    // the transaction links to its interchange
    expect(stored!.canonical).toBeDefined();
  });

  it('dedup persists across receives; conflict is recorded needing review', async () => {
    const edi = await validEdi();
    await inbound.receive(rel, 'sftp:acme', edi, at);
    const dup = await inbound.receive(rel, 'sftp:acme', edi, at);
    expect(dup.outcome).toBe('duplicate');
    const conflict = await inbound.receive(rel, 'sftp:acme', edi.replace(/4500/g, '4599'), at);
    expect(conflict.outcome).toBe('conflict');

    const timeline = await ledger.timeline('t1', conflict.event!.dedupKey);
    expect(timeline.map((e) => e.outcome)).toEqual(['accepted', 'duplicate', 'conflict']);
    expect(await ledger.needingReview('t1')).toHaveLength(1); // the conflict
  });
});
