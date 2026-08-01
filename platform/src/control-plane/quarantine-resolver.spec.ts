import { QuarantineResolver } from './quarantine-resolver';
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
import { ControlNumberService } from '../envelope/control-number.service';
import { ConformanceValidator } from '../validation/conformance-validator';
import { MapValidator } from '../mapping/dsl/map-validator';
import { X12Service, RawSegment } from '../x12/x12.service';
import { HOUSE_850 } from '../validation/specs/house850';
import { SAMPLE_MAP } from '../testing/fixtures';
import { EdiMap } from '../mapping/dsl/map.types';
import { InboundGateway } from '../intake/inbound-gateway';
import { InMemoryRawArtifactStore } from '../intake/raw-artifact.store';
import { InMemoryDedupStore } from '../intake/dedup.store';
import { InMemoryProcessingLedger, ProcessingLedger } from '../intake/processing-ledger';
import { FunctionalAckService } from '../ack/functional-ack.service';

describe('QuarantineResolver (operator actions on the review queue)', () => {
  const x12 = new X12Service();
  const envelope = new EnvelopeService();
  const at = new Date('2026-08-02T10:00:00Z');
  const later = new Date('2026-08-02T11:00:00Z');
  const csv =
    'PO,Date,Line,SKU,Qty,UOM,Price\n4500,2026-07-31,1,012345678905,10,EA,18.50\n4500,2026-07-31,2,099887766554,5,EA,44.00\n';

  const ffMap: ConnectorInstance['connectorMap'] = {
    connector: 'csv', docType: '850', direction: 'inbound',
    header: [{ to: 'poNumber', from: 'PO' }, { to: 'poDate', from: 'Date' }],
    lineTo: 'lineItems',
    lineFields: [
      { to: 'lineNumber', from: 'Line' }, { to: 'ids.0.value', from: 'SKU' },
      { to: 'quantity.value', from: 'Qty', decimal: 0 }, { to: 'quantity.uom', from: 'UOM' },
      { to: 'unitPrice.amount', from: 'Price', decimal: 2 },
    ],
  };
  const instance: ConnectorInstance = {
    id: 'ci-ff', tenantId: 't1', connectorType: 'csv', settings: { hasHeader: true },
    connectorMap: ffMap, docTypes: ['850'], trigger: 'file-drop',
  };
  const rel: TradingRelationship = {
    id: 'rel', tenantId: 't1', partnerId: 'acme', formatAuthority: 'client', tenantRole: 'buyer',
    version: '004010', mode: 'test',
    envelope: { senderQualifier: 'ZZ', senderId: 'ACME', receiverQualifier: 'ZZ', receiverId: 'RET', gsVersion: '004010' },
    documents: [
      { docType: '850', direction: 'outbound', mapId: 'acme-850-out', specId: 'house-850', connectorInstanceId: 'ci-ff', enabled: true },
      { docType: '850', direction: 'inbound', mapId: 'acme-850-in', specId: 'house-850', connectorInstanceId: 'ci-ff', enabled: true },
    ],
    active: true,
  };

  let inbound: InboundPipeline;
  let orch: IntegrationOrchestrator;
  let ledger: ProcessingLedger;
  let resolver: QuarantineResolver;
  const seg = (segs: RawSegment[], tag: string) => segs.find((s) => s.tag === tag);

  beforeEach(() => {
    const maps = new MapRegistry(new MapValidator());
    maps.register('acme-850-out', SAMPLE_MAP);
    maps.register('acme-850-in', { ...SAMPLE_MAP, direction: 'inbound' } as EdiMap);
    const specs = new SpecRegistry();
    specs.register('house-850', HOUSE_850);
    const connectors = new ConnectorRegistry();
    new CsvConnector(new ObjectMapper(), connectors);
    const instances = new ConnectorInstanceStore();
    instances.upsert(instance);
    const controlNumbers = new ControlNumberService();
    const pipeline = new TranslationPipeline(
      new EmitService(), new IngestService(), envelope, controlNumbers, new ConformanceValidator(), maps, specs,
    );
    orch = new IntegrationOrchestrator(pipeline, connectors, instances);
    const raw = new InMemoryRawArtifactStore();
    ledger = new InMemoryProcessingLedger();
    const gateway = new InboundGateway(raw, new InMemoryDedupStore(), x12);
    inbound = new InboundPipeline(gateway, x12, pipeline, orch, new FunctionalAckService(), envelope, controlNumbers, ledger);
    resolver = new QuarantineResolver(ledger, raw, inbound);
  });

  const validEdi = async (): Promise<string> =>
    x12.serialize((await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange);
  const invalidEdi = async (): Promise<string> => {
    const segs = (await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange;
    seg(segs, 'BEG')!.elements[1] = 'ZZ'; // BEG02 invalid code
    return x12.serialize(segs);
  };

  it('queue() lists open conflicts and rejects', async () => {
    await inbound.receive(rel, 'sftp:acme', await validEdi(), at); // accepted (not in queue)
    await inbound.receive(rel, 'sftp:acme', await invalidEdi(), at); // rejected → queue
    expect(resolver.queue('t1').map((e) => e.outcome)).toEqual(['rejected']);
  });

  it('dismiss() closes a conflict without processing, and drops it from the queue', async () => {
    const edi = await validEdi();
    await inbound.receive(rel, 'sftp:acme', edi, at);
    const conflict = await inbound.receive(rel, 'sftp:acme', edi.replace(/4500/g, '4599'), at);
    expect(conflict.outcome).toBe('conflict');

    const { resolution, result } = resolver.dismiss(conflict.event!.id, 'ops@acme', 'partner double-sent under a reused ICN', later);
    expect(result).toBeUndefined(); // nothing processed/delivered
    expect(resolution).toMatchObject({ resolution: 'dismissed', resolvedBy: 'ops@acme', resolvedAt: later.toISOString() });
    expect(resolver.queue('t1')).toHaveLength(0);
  });

  it('reprocess() a conflict whose content is valid → accepted, delivered, and linked', async () => {
    const edi = await validEdi();
    await inbound.receive(rel, 'sftp:acme', edi, at);
    const conflict = await inbound.receive(rel, 'sftp:acme', edi.replace(/4500/g, '4599'), at); // valid, different PO

    const { resolution, result } = await resolver.reprocess(rel, conflict.event!.id, 'ops@acme', 'the 4599 revision supersedes', later);

    expect(result!.outcome).toBe('accepted');
    expect((result!.transactions[0].deliveredPayload as string)).toContain('4599'); // reached the customer
    expect(result!.receipt).toBeUndefined(); // reprocess is not a fresh intake
    // the review event is stamped and linked to the new processing event
    expect(resolution).toMatchObject({ resolution: 'reprocessed', resolutionEventId: result!.transactions[0].event.id });
    expect(resolver.queue('t1')).toHaveLength(0);
  });

  it('reprocess() a still-invalid doc → rejected again; original resolved, new reject re-queued', async () => {
    const rejected = await inbound.receive(rel, 'sftp:acme', await invalidEdi(), at);
    expect(rejected.outcome).toBe('rejected');

    const original = rejected.transactions[0].event;
    const { result } = await resolver.reprocess(rel, original.id, 'ops@acme', 'retry as-is', later);
    expect(result!.outcome).toBe('rejected'); // same bytes, same spec → still fails
    expect(result!.transactions[0].event.note).toContain(`reprocess of ${original.id}`);

    const queue = resolver.queue('t1');
    expect(queue.map((e) => e.id)).toEqual([result!.transactions[0].event.id]); // original gone, new reject present
  });

  it('guards: unknown / non-review / already-resolved events are refused', async () => {
    expect(() => resolver.dismiss('nope', 'op', 'x', later)).toThrow(/not found/);

    const accepted = await inbound.receive(rel, 'sftp:acme', await validEdi(), at);
    expect(() => resolver.dismiss(accepted.transactions[0].event.id, 'op', 'x', later)).toThrow(/not in the review queue/);

    const rejected = await inbound.receive(rel, 'sftp:acme', await invalidEdi(), at);
    const rejectedId = rejected.transactions[0].event.id;
    resolver.dismiss(rejectedId, 'op', 'first', later);
    expect(() => resolver.dismiss(rejectedId, 'op', 'again', later)).toThrow(/already resolved/);
  });
});
