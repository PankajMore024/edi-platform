import { TranslationPipeline } from './translation-pipeline';
import { MapRegistry } from './map-registry';
import { SpecRegistry } from './spec-registry';
import { RelationshipStore } from './relationship-store';
import { TradingRelationship } from './config.types';
import { EmitService } from '../mapping/engine/emit.service';
import { IngestService } from '../mapping/engine/ingest.service';
import { EnvelopeService } from '../envelope/envelope.service';
import { InMemoryControlNumberService } from '../envelope/control-number.service';
import { ConformanceValidator } from '../validation/conformance-validator';
import { MapValidator } from '../mapping/dsl/map-validator';
import { X12Service } from '../x12/x12.service';
import { HOUSE_850 } from '../validation/specs/house850';
import { SAMPLE_MAP, SAMPLE_DOC } from '../testing/fixtures';
import { EdiMap } from '../mapping/dsl/map.types';

describe('TranslationPipeline (engine governed by config)', () => {
  let pipeline: TranslationPipeline;
  let store: RelationshipStore;
  let maps: MapRegistry;
  let specs: SpecRegistry;
  const x12 = new X12Service();
  const at = new Date('2026-08-01T09:05:00Z');

  const rel: TradingRelationship = {
    id: 'rel-acme',
    tenantId: 't1',
    partnerId: 'acme',
    partnerName: 'ACME Retail',
    formatAuthority: 'client',
    tenantRole: 'buyer',
    version: '004010',
    mode: 'test',
    envelope: { senderQualifier: 'ZZ', senderId: 'ACME', receiverQualifier: 'ZZ', receiverId: 'RETAILER', gsVersion: '004010' },
    documents: [
      { docType: '850', direction: 'outbound', mapId: 'acme-850-out', specId: 'house-850', enabled: true },
      { docType: '850', direction: 'inbound', mapId: 'acme-850-in', specId: 'house-850', enabled: true },
    ],
    active: true,
  };

  beforeEach(() => {
    maps = new MapRegistry(new MapValidator());
    specs = new SpecRegistry();
    store = new RelationshipStore();
    pipeline = new TranslationPipeline(
      new EmitService(), new IngestService(), new EnvelopeService(),
      new InMemoryControlNumberService(), new ConformanceValidator(), maps, specs,
    );
    maps.register('acme-850-out', SAMPLE_MAP);
    maps.register('acme-850-in', { ...SAMPLE_MAP, direction: 'inbound' } as EdiMap);
    specs.register('house-850', HOUSE_850);
    store.upsert(rel);
  });

  it('emits a full, conformant interchange driven by the relationship', async () => {
    const r = await pipeline.emitDocument(rel, '850', SAMPLE_DOC, at);
    expect(r.validation.valid).toBe(true);
    expect(r.validation.errors).toEqual([]);
    expect(r.control.isa13).toBe('000000001'); // first allocation for this relationship
    const edi = x12.serialize(r.interchange);
    expect(edi).toMatch(/^ISA\*/);
    expect(edi).toContain('BEG*00*SA*4500');
    expect(edi).toContain('CTT*2');
    expect(edi.trimEnd().endsWith('~')).toBe(true);
    expect(edi).toContain('IEA*1*000000001');
  });

  it('surfaces conformance errors from the pipeline (bad UOM code)', async () => {
    const badDoc: any = JSON.parse(JSON.stringify(SAMPLE_DOC));
    badDoc.lineItems[0].quantity.uom = 'ZZZ'; // not in the house-850 UOM code list
    const r = await pipeline.emitDocument(rel, '850', badDoc, at);
    expect(r.validation.valid).toBe(false);
    expect(r.validation.errors.join(' ')).toMatch(/PO103: code "ZZZ" not allowed/);
  });

  it('round-trips: ingest the emitted interchange back to canonical, validated', async () => {
    const emitted = await pipeline.emitDocument(rel, '850', SAMPLE_DOC, at);
    const r = pipeline.ingestDocument(rel, emitted.interchange);
    expect(r.docType).toBe('850');
    expect((r.doc as any).poNumber).toBe('4500');
    expect(r.validation.valid).toBe(true);
  });

  it('errors clearly when no config exists for the doc/direction', async () => {
    await expect(pipeline.emitDocument(rel, '856', SAMPLE_DOC, at)).rejects.toThrow(/no enabled outbound config for 856/);
  });

  it('exposes catalog descriptors for the admin console', () => {
    expect(maps.list()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'acme-850-out', kind: 'map' })]),
    );
    expect(specs.list()[0]).toMatchObject({ id: 'house-850', kind: 'spec' });
    expect(store.list()[0]).toMatchObject({ kind: 'relationship', name: 'ACME Retail' });
  });
});
