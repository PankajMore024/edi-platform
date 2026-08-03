import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TransactionRepository } from '../db/repositories/transaction.repository';
import { ProcessingRepository } from '../db/repositories/processing.repository';
import { TradingRelationship } from '../control-plane/config.types';

describe('Provisioning API (e2e, node:sqlite)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('GET /api/catalog lists connectors + transports', async () => {
    const res = await http().get('/api/catalog').expect(200);
    expect(res.body.connectors.map((c: any) => c.id).sort()).toEqual(['amazon', 'csv', 'database', 'generic-rest', 'quickbooks', 'shopify', 'xlsx']);
    expect(res.body.transports.map((t: any) => t.id).sort()).toEqual(['sftp', 'webhook']);
  });

  it('PUT then GET /api/relationships round-trips config, tenant-scoped', async () => {
    const rel: TradingRelationship = {
      id: 'rel-1', tenantId: 't1', partnerId: 'acme', formatAuthority: 'client', tenantRole: 'buyer',
      version: '004010', mode: 'test',
      envelope: { senderQualifier: 'ZZ', senderId: 'ACME', receiverQualifier: 'ZZ', receiverId: 'RET', gsVersion: '004010' },
      documents: [{ docType: '850', direction: 'inbound', mapId: 'm-in', specId: 'house-850', connectorInstanceId: 'ci', enabled: true }],
      active: true,
    };
    await http().put('/api/relationships/rel-1').set('x-tenant-id', 't1').send(rel).expect(200);

    const list = await http().get('/api/relationships').set('x-tenant-id', 't1').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: 'rel-1', partnerId: 'acme', documents: [{ docType: '850', mapId: 'm-in' }] });

    // isolated by tenant
    const otherTenant = await http().get('/api/relationships').set('x-tenant-id', 't2').expect(200);
    expect(otherTenant.body).toEqual([]);
    await http().get('/api/relationships/nope').set('x-tenant-id', 't1').expect(404);
  });

  it('GET /api/documents serves persisted transactions', async () => {
    const txns = app.get(TransactionRepository);
    await txns.save({
      tenantId: 't1', relationshipId: 'rel-1', direction: 'inbound', docType: '850',
      transactionControlNumber: '0001', functionalGroupControlNumber: '1', currentState: 'DELIVERED', conformant: true,
      receivedAt: '2026-08-02T09:00:00.000Z',
      doc: { meta: { docType: '850', direction: 'inbound', partner: '', tenantId: 't1' }, poNumber: '4500', lineItems: [{ ids: [{ type: 'UP', value: 'A1' }], quantity: { value: 2 } }] } as any,
    });

    const res = await http().get('/api/documents').set('x-tenant-id', 't1').expect(200);
    expect(res.body.map((d: any) => d.poNumber)).toEqual(['4500']);
    const id = res.body[0].id;
    const detail = await http().get(`/api/documents/${id}`).set('x-tenant-id', 't1').expect(200);
    expect(detail.body.canonical.poNumber).toBe('4500');
    expect(detail.body.canonical.lineItems[0].quantity.value).toBe(2);
  });

  it('POST /api/connectors/import-sample profiles a client sample; PUT persists an instance', async () => {
    const csv = 'PO_Number,Order_Date,Item_SKU,Qty,Unit_Price\n4500,2026-07-31,A1,10,18.50\n';
    const prof = await http().post('/api/connectors/import-sample').send({ type: 'csv', sample: csv, docType: '850' }).expect(201);
    expect(prof.body.fields.find((f: any) => f.path === 'PO_Number').suggestion.target).toBe('poNumber');
    expect(prof.body.fields.find((f: any) => f.path === 'Item_SKU').suggestion.target).toBe('lines[].sku');
    await http().post('/api/connectors/import-sample').send({ type: 'csv' }).expect(400); // missing sample/docType

    const inst = {
      id: 'ci-1', tenantId: 't1', connectorType: 'csv', settings: { hasHeader: true }, docTypes: ['850'], trigger: 'file-drop',
      connectorMap: { connector: 'csv', docType: '850', direction: 'inbound', header: [{ to: 'poNumber', from: 'PO_Number' }] },
    };
    await http().put('/api/connectors/ci-1').set('x-tenant-id', 't1').send(inst).expect(200);
    const got = await http().get('/api/connectors/ci-1').set('x-tenant-id', 't1').expect(200);
    expect(got.body).toMatchObject({ id: 'ci-1', connectorType: 'csv', docTypes: ['850'] });
    expect(got.body.connectorMap.header[0]).toEqual({ to: 'poNumber', from: 'PO_Number' });
  });

  it('provisions specs / partner-maps / transports (the rest of the config graph)', async () => {
    const spec = { docType: '850', version: '004010', owner: 'client', segments: [{ tag: 'BEG', requirement: 'mandatory', elements: [] }] };
    await http().put('/api/specs/house-850').set('x-tenant-id', 't1').send(spec).expect(200);
    expect((await http().get('/api/specs/house-850').set('x-tenant-id', 't1').expect(200)).body).toMatchObject({ docType: '850', owner: 'client' });
    expect((await http().get('/api/specs').set('x-tenant-id', 't1').expect(200)).body.map((s: any) => s.id)).toEqual(['house-850']);

    const pmap = { docType: '850', direction: 'inbound', functionalId: 'PO', segments: [] };
    await http().put('/api/partner-maps/acme-850-in').set('x-tenant-id', 't1').send(pmap).expect(200);
    expect((await http().get('/api/partner-maps/acme-850-in').set('x-tenant-id', 't1').expect(200)).body).toMatchObject({ docType: '850', direction: 'inbound' });

    const tp = { id: 'tp-1', tenantId: 't1', transportType: 'sftp', settings: { host: 'sftp.acme.com' }, vaultRef: 'vault://1', direction: 'both' };
    await http().put('/api/transports/tp-1').set('x-tenant-id', 't1').send(tp).expect(200);
    expect((await http().get('/api/transports').set('x-tenant-id', 't1').expect(200)).body[0]).toMatchObject({ id: 'tp-1', transportType: 'sftp' });
    await http().get('/api/specs/nope').set('x-tenant-id', 't1').expect(404);
  });

  it('GET /api/review serves the queue; dismiss resolves it', async () => {
    const ledger = app.get(ProcessingRepository);
    const ev = await ledger.record({
      tenantId: 't1', relationshipId: 'rel-1', outcome: 'rejected', source: 'sftp:x', receivedAt: '2026-08-02T09:00:00.000Z',
      artifactId: 'a1', dedupKey: 'k1', occurrence: 1, delivered: false, needsReview: true,
    });

    const q1 = await http().get('/api/review').set('x-tenant-id', 't1').expect(200);
    expect(q1.body.map((e: any) => e.id)).toContain(ev.id);

    await http().post(`/api/review/${ev.id}/dismiss`).set('x-tenant-id', 't1').send({ resolvedBy: 'ops', note: 'waived' }).expect(201);
    const q2 = await http().get('/api/review').set('x-tenant-id', 't1').expect(200);
    expect(q2.body.map((e: any) => e.id)).not.toContain(ev.id);
  });
});
