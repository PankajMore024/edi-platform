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
import { X12Service } from '../x12/x12.service';
import { HOUSE_850 } from '../validation/specs/house850';
import { SAMPLE_MAP } from '../testing/fixtures';
import { EdiMap } from '../mapping/dsl/map.types';

describe('IntegrationOrchestrator (customer edge ↔ engine ↔ partner edge)', () => {
  const x12 = new X12Service();
  const at = new Date('2026-08-01T09:05:00Z');
  const csv =
    'PO,Date,Line,SKU,Qty,UOM,Price\n' +
    '4500,2026-07-31,1,012345678905,10,EA,18.50\n' +
    '4500,2026-07-31,2,099887766554,5,EA,44.00\n';

  const ffMap: ConnectorInstance['connectorMap'] = {
    connector: 'flat-file', docType: '850', direction: 'inbound',
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
    settings: { hasHeader: true }, connectorMap: ffMap,
    docTypes: ['850'], trigger: 'file-drop',
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

  let orch: IntegrationOrchestrator;
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
    const pipeline = new TranslationPipeline(
      new EmitService(), new IngestService(), new EnvelopeService(),
      new ControlNumberService(), new ConformanceValidator(), maps, specs,
    );
    orch = new IntegrationOrchestrator(pipeline, connectors, instances);
  });

  it('customer → partner: a CSV becomes a validated X12 interchange', async () => {
    const results = await orch.receiveFromCustomer(rel, '850', csv, at);
    expect(results).toHaveLength(1);
    expect(results[0].validation.valid).toBe(true);
    const edi = x12.serialize(results[0].interchange);
    expect(edi).toMatch(/^ISA\*/);
    expect(edi).toContain('BEG*00*SA*4500**20260731');
    expect(edi).toContain('PO1*1*10*EA*18.50**UP*012345678905');
    expect(edi).toContain('CTT*2');
    expect(edi).toContain('IEA*');
  });

  it('partner → customer: an X12 interchange becomes a CSV delivered to the customer', async () => {
    const interchange = (await orch.receiveFromCustomer(rel, '850', csv, at))[0].interchange;
    const delivered = await orch.deliverToCustomer(rel, interchange);
    expect(delivered.docType).toBe('850');
    expect(delivered.validation.valid).toBe(true);
    expect(typeof delivered.native).toBe('string');
    const outCsv = delivered.native as string;
    expect(outCsv.split('\n')[0]).toBe('PO,Date,Line,SKU,Qty,UOM,Price'); // header from the connector-map
    expect(outCsv).toContain('4500,2026-07-31,1,012345678905,10,EA,18.50');
  });

  it('errors clearly when a doc has no connector bound', async () => {
    const noConn: TradingRelationship = { ...rel, documents: [{ ...rel.documents[0], connectorInstanceId: undefined }] };
    await expect(orch.receiveFromCustomer(noConn, '850', csv, at)).rejects.toThrow(/no connectorInstanceId/);
  });
});
