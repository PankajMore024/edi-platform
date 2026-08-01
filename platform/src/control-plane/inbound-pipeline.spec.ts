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
import { InMemoryRawArtifactStore, RawArtifactStore } from '../intake/raw-artifact.store';
import { InMemoryDedupStore } from '../intake/dedup.store';
import { InMemoryProcessingLedger, ProcessingLedger } from '../intake/processing-ledger';
import { FunctionalAckService } from '../ack/functional-ack.service';

describe('InboundPipeline (partner X12 → intake → translate → deliver → 997)', () => {
  const x12 = new X12Service();
  const envelope = new EnvelopeService();
  const at = new Date('2026-08-02T09:05:00Z');
  const csv =
    'PO,Date,Line,SKU,Qty,UOM,Price\n' +
    '4500,2026-07-31,1,012345678905,10,EA,18.50\n' +
    '4500,2026-07-31,2,099887766554,5,EA,44.00\n';

  const ffMap: ConnectorInstance['connectorMap'] = {
    connector: 'csv', docType: '850', direction: 'inbound',
    header: [{ to: 'poNumber', from: 'PO' }, { to: 'poDate', from: 'Date' }],
    lineTo: 'lineItems',
    lineFields: [
      { to: 'lineNumber', from: 'Line' },
      { to: 'ids.0.value', from: 'SKU' },
      { to: 'quantity.value', from: 'Qty', decimal: 0 },
      { to: 'quantity.uom', from: 'UOM' },
      { to: 'unitPrice.amount', from: 'Price', decimal: 2 },
    ],
  };
  const instance: ConnectorInstance = {
    id: 'ci-ff', tenantId: 't1', connectorType: 'csv',
    settings: { hasHeader: true }, connectorMap: ffMap, docTypes: ['850'], trigger: 'file-drop',
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
  let raw: RawArtifactStore;
  let ledger: ProcessingLedger;
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
    raw = new InMemoryRawArtifactStore();
    ledger = new InMemoryProcessingLedger();
    const gateway = new InboundGateway(raw, new InMemoryDedupStore(), x12);
    inbound = new InboundPipeline(gateway, x12, pipeline, orch, new FunctionalAckService(), envelope, controlNumbers, ledger);
  });

  /** Emit a genuine, conformant inbound 850 interchange (as if a partner sent it to us). */
  const validEdi = async (): Promise<string> =>
    x12.serialize((await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange);

  it('ACCEPTED: conformant 850 → delivered to customer + 997 accepting the group', async () => {
    const edi = await validEdi();
    const gs06 = envelope.parseInterchange(x12.parse(edi)).control.gs06;

    const r = await inbound.receive(rel, 'sftp:acme', edi, at);

    expect(r.outcome).toBe('accepted');
    expect(r.validation?.valid).toBe(true);
    expect(typeof r.delivered).toBe('string'); // CSV delivered into the customer system
    expect((r.delivered as string)).toContain('4500,2026-07-31,1,012345678905,10,EA,18.50');
    // 997: AK1 echoes the received group control number; AK9 accepts 1/1/1; no AK3 detail
    expect(seg(r.ack!.segments, 'AK1')!.elements[1]).toBe(gs06);
    expect(seg(r.ack!.segments, 'AK9')!.elements).toEqual(['A', '1', '1', '1']);
    expect(seg(r.ack!.segments, 'AK3')).toBeUndefined();
    expect(r.ack!.edi).toContain('ST*997*');
    // lifecycle event captured
    expect(r.event).toMatchObject({ outcome: 'accepted', delivered: true, valid: true, needsReview: false });
    expect(r.event.ackControlNumber).toBe(r.ack!.control.isa13);
  });

  it('REJECTED: non-conformant 850 → NOT delivered + 997 rejecting with AK3/AK4 detail', async () => {
    const segs = (await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange;
    seg(segs, 'BEG')!.elements[1] = 'ZZ'; // BEG02 invalid code
    const edi = x12.serialize(segs);

    const r = await inbound.receive(rel, 'sftp:acme', edi, at);

    expect(r.outcome).toBe('rejected');
    expect(r.validation?.valid).toBe(false);
    expect(r.delivered).toBeUndefined(); // a bad doc is never pushed into the customer system
    expect(seg(r.ack!.segments, 'AK9')!.elements).toEqual(['R', '1', '1', '0']);
    expect(seg(r.ack!.segments, 'AK5')!.elements).toEqual(['R', '5']);
    expect(seg(r.ack!.segments, 'AK3')).toBeDefined(); // per-segment detail present
    // lifecycle event flags a rejected doc for review (it was not delivered)
    expect(r.event).toMatchObject({ outcome: 'rejected', delivered: false, valid: false, needsReview: true });
    expect(r.event.errorCount).toBeGreaterThan(0);
  });

  it('DUPLICATE: the same interchange twice → idempotent skip (no re-delivery, no ack)', async () => {
    const edi = await validEdi();
    const first = await inbound.receive(rel, 'sftp:acme', edi, at);
    const second = await inbound.receive(rel, 'sftp:acme', edi, at);

    expect(first.outcome).toBe('accepted');
    expect(second.outcome).toBe('duplicate');
    expect(second.delivered).toBeUndefined();
    expect(second.ack).toBeUndefined();
    // still recorded (occurrence 2), pointing at the same original artifact; no review needed
    expect(second.event).toMatchObject({ outcome: 'duplicate', occurrence: 2, needsReview: false });
    expect(second.event.firstArtifactId).toBe(first.event.artifactId);
  });

  it('CONFLICT: same interchange identity, different content → quarantined, not processed', async () => {
    const edi = await validEdi();
    const tampered = edi.replace(/4500/g, '4599'); // same ISA/GS/ST control numbers, different PO

    const first = await inbound.receive(rel, 'sftp:acme', edi, at);
    const second = await inbound.receive(rel, 'sftp:acme', tampered, at);

    expect(first.outcome).toBe('accepted');
    expect(second.outcome).toBe('conflict');
    expect(second.delivered).toBeUndefined();
    expect(second.ack).toBeUndefined();
    expect(second.event).toMatchObject({ outcome: 'conflict', needsReview: true });
    // the conflicting bytes are a DIFFERENT artifact than the original — both are retained
    expect(second.event.artifactId).not.toBe(first.event.artifactId);
    expect(second.event.firstArtifactId).toBe(first.event.artifactId);
  });

  describe('lifecycle capture (nothing dropped unattended)', () => {
    it('every outcome writes a ledger event; conflicts + rejects surface in the review queue', async () => {
      const edi = await validEdi();
      await inbound.receive(rel, 'sftp:acme', edi, at); // accepted
      await inbound.receive(rel, 'sftp:acme', edi, at); // duplicate
      await inbound.receive(rel, 'sftp:acme', edi.replace(/4500/g, '4599'), at); // conflict

      expect(ledger.list({ relationshipId: 'rel' })).toHaveLength(3);
      const review = ledger.needingReview('t1');
      expect(review.map((r) => r.outcome)).toEqual(['conflict']);
    });

    it('timeline() reconstructs a document’s full history under one interchange identity', async () => {
      const edi = await validEdi();
      const r1 = await inbound.receive(rel, 'sftp:acme', edi, at);
      await inbound.receive(rel, 'sftp:acme', edi, at);
      const timeline = ledger.timeline(r1.receipt.dedupKey);
      expect(timeline.map((e) => e.outcome)).toEqual(['accepted', 'duplicate']);
    });

    it('both the original and the conflicting bytes are retrievable for operator comparison', async () => {
      const edi = await validEdi();
      const orig = await inbound.receive(rel, 'sftp:acme', edi, at);
      const conflict = await inbound.receive(rel, 'sftp:acme', edi.replace(/4500/g, '4599'), at);

      // an operator working the review queue can pull BOTH versions from the artifact store
      expect(raw.get(conflict.event.firstArtifactId!)?.bytes).toBe(edi);
      expect((raw.get(conflict.event.artifactId)?.bytes as string)).toContain('4599');
    });
  });
});
