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
    const controlNumbers = new InMemoryControlNumberService();
    const pipeline = new TranslationPipeline(
      new EmitService(), new IngestService(), envelope, controlNumbers, new ConformanceValidator(), maps, specs,
    );
    orch = new IntegrationOrchestrator(pipeline, connectors, instances);
    raw = new InMemoryRawArtifactStore();
    ledger = new InMemoryProcessingLedger();
    const gateway = new InboundGateway(raw, new InMemoryDedupStore(), x12);
    inbound = new InboundPipeline(gateway, x12, pipeline, orch, new FunctionalAckService(), envelope, controlNumbers, ledger);
  });

  const validEdi = async (): Promise<string> =>
    x12.serialize((await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange);

  // ── helpers to assemble batched interchanges from a genuinely emitted single one ──
  const clone = (segs: RawSegment[]): RawSegment[] => segs.map((s) => ({ tag: s.tag, elements: [...s.elements] }));
  const parts = async () => {
    const segs = (await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange;
    const stIdx = segs.findIndex((s) => s.tag === 'ST');
    const seIdx = segs.findIndex((s) => s.tag === 'SE');
    return {
      isa: seg(segs, 'ISA')!, gs: seg(segs, 'GS')!, iea: seg(segs, 'IEA')!,
      body: clone(segs.slice(stIdx + 1, seIdx)),
    };
  };
  const corrupt = (body: RawSegment[]): RawSegment[] => {
    const b = clone(body);
    seg(b, 'BEG')!.elements[1] = 'ZZ'; // invalid BEG02 code
    return b;
  };
  const groupBlock = (gs: RawSegment, gs06: string, sets: { st02: string; body: RawSegment[] }[]): RawSegment[] => {
    const g: RawSegment = { tag: 'GS', elements: [...gs.elements] };
    g.elements[5] = gs06;
    const inner: RawSegment[] = [];
    for (const s of sets) {
      inner.push({ tag: 'ST', elements: ['850', s.st02] }, ...s.body, { tag: 'SE', elements: [String(s.body.length + 2), s.st02] });
    }
    return [g, ...inner, { tag: 'GE', elements: [String(sets.length), gs06] }];
  };

  it('ACCEPTED: conformant 850 → delivered + 997 accepting the group', async () => {
    const edi = await validEdi();
    const gs06 = envelope.parseInterchange(x12.parse(edi)).control.gs06;
    const r = await inbound.receive(rel, 'sftp:acme', edi, at);

    expect(r.outcome).toBe('accepted');
    expect(r.transactions).toHaveLength(1);
    const t = r.transactions[0];
    expect(t.conformant).toBe(true);
    expect(t.delivered).toBe(true);
    expect((t.deliveredPayload as string)).toContain('4500,2026-07-31,1,012345678905,10,EA,18.50');
    expect(t.event).toMatchObject({ outcome: 'accepted', delivered: true, needsReview: false });
    expect(r.acks).toHaveLength(1);
    expect(seg(r.acks[0].segments, 'AK1')!.elements[1]).toBe(gs06);
    expect(seg(r.acks[0].segments, 'AK9')!.elements).toEqual(['A', '1', '1', '1']);
    expect(seg(r.acks[0].segments, 'AK3')).toBeUndefined();
  });

  it('REJECTED: non-conformant 850 → NOT delivered + 997 with AK3/AK4 detail', async () => {
    const segs = (await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange;
    seg(segs, 'BEG')!.elements[1] = 'ZZ';
    const r = await inbound.receive(rel, 'sftp:acme', x12.serialize(segs), at);

    expect(r.outcome).toBe('rejected');
    const t = r.transactions[0];
    expect(t.delivered).toBe(false);
    expect(t.deliveredPayload).toBeUndefined();
    expect(t.event).toMatchObject({ outcome: 'rejected', delivered: false, needsReview: true });
    expect(seg(r.acks[0].segments, 'AK9')!.elements).toEqual(['R', '1', '1', '0']);
    expect(seg(r.acks[0].segments, 'AK3')).toBeDefined();
  });

  it('DUPLICATE: same interchange twice → idempotent skip (interchange-level event, no transactions)', async () => {
    const edi = await validEdi();
    const first = await inbound.receive(rel, 'sftp:acme', edi, at);
    const second = await inbound.receive(rel, 'sftp:acme', edi, at);

    expect(first.outcome).toBe('accepted');
    expect(second.outcome).toBe('duplicate');
    expect(second.transactions).toHaveLength(0);
    expect(second.acks).toHaveLength(0);
    expect(second.event).toMatchObject({ outcome: 'duplicate', occurrence: 2, needsReview: false });
  });

  it('CONFLICT: same identity, different content → quarantined, not processed', async () => {
    const edi = await validEdi();
    const first = await inbound.receive(rel, 'sftp:acme', edi, at);
    const second = await inbound.receive(rel, 'sftp:acme', edi.replace(/4500/g, '4599'), at);

    expect(second.outcome).toBe('conflict');
    expect(second.transactions).toHaveLength(0);
    expect(second.event).toMatchObject({ outcome: 'conflict', needsReview: true });
    // the conflicting bytes are a DIFFERENT artifact than the original — both retained
    expect(second.event!.artifactId).not.toBe(first.transactions[0].event.artifactId);
    expect(second.event!.firstArtifactId).toBe(first.transactions[0].event.artifactId);
  });

  describe('batched interchanges', () => {
    it('multi-TS in one group: each set processed independently; ONE 997 with per-set AK2/AK5', async () => {
      const { isa, gs, iea, body } = await parts();
      // set 1 valid, set 2 invalid, both in the same functional group
      const edi = x12.serialize([isa, ...groupBlock(gs, 'G1', [
        { st02: '0001', body },
        { st02: '0002', body: corrupt(body) },
      ]), iea]);

      const r = await inbound.receive(rel, 'sftp:acme', edi, at);

      expect(r.transactions).toHaveLength(2);
      expect(r.transactions.map((t) => t.conformant)).toEqual([true, false]);
      expect(r.transactions.map((t) => t.delivered)).toEqual([true, false]); // bad set NOT delivered
      expect(r.outcome).toBe('rejected'); // any non-conformant set → interchange needs attention

      expect(r.acks).toHaveLength(1); // one 997 for the one group
      const ack = r.acks[0].segments;
      expect(ack.filter((s) => s.tag === 'AK2')).toHaveLength(2);
      expect(ack.filter((s) => s.tag === 'AK5').map((s) => s.elements[0])).toEqual(['A', 'R']);
      expect(seg(ack, 'AK9')!.elements).toEqual(['P', '2', '2', '1']); // partially accepted: 1 of 2
    });

    it('multi-group: one 997 per functional group', async () => {
      const { isa, gs, iea, body } = await parts();
      const edi = x12.serialize([
        isa,
        ...groupBlock(gs, 'G1', [{ st02: '0001', body }]),
        ...groupBlock(gs, 'G2', [{ st02: '0001', body: clone(body) }]),
        iea,
      ]);

      const r = await inbound.receive(rel, 'sftp:acme', edi, at);

      expect(r.transactions).toHaveLength(2);
      expect(r.outcome).toBe('accepted');
      expect(r.acks).toHaveLength(2); // one 997 per group
      expect(r.acks.map((a) => a.groupControlNumber)).toEqual(['G1', 'G2']);
      expect(r.acks.map((a) => seg(a.segments, 'AK1')!.elements[1])).toEqual(['G1', 'G2']);
    });

    it('per-set lifecycle: both sets in a batch share the artifact but get distinct events', async () => {
      const { isa, gs, iea, body } = await parts();
      const edi = x12.serialize([isa, ...groupBlock(gs, 'G1', [
        { st02: '0001', body }, { st02: '0002', body: clone(body) },
      ]), iea]);
      const r = await inbound.receive(rel, 'sftp:acme', edi, at);

      const [e1, e2] = r.transactions.map((t) => t.event);
      expect(e1.artifactId).toBe(e2.artifactId); // same retained interchange
      expect(e1.transactionControlNumber).toBe('0001');
      expect(e2.transactionControlNumber).toBe('0002');
      expect(await ledger.timeline('t1', r.receipt!.dedupKey)).toHaveLength(2);
    });
  });
});
