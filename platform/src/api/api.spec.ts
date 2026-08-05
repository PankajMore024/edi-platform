import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../app.module';
import { TransactionRepository } from '../db/repositories/transaction.repository';
import { ProcessingRepository } from '../db/repositories/processing.repository';
import { ApiKeyRepository } from '../db/repositories/api-key.repository';
import { ShopifyRegistrationRepository } from '../db/repositories/shopify-registration.repository';
import { TradingRelationship } from '../control-plane/config.types';

describe('Provisioning API (e2e, node:sqlite)', () => {
  let app: INestApplication;
  let t1: string; // bearer key for tenant t1
  let t2: string; // bearer key for tenant t2
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true }); // Shopify HMAC needs the raw body
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const keys = app.get(ApiKeyRepository);
    t1 = `Bearer ${(await keys.issue('t1', 'test')).key}`;
    t2 = `Bearer ${(await keys.issue('t2', 'test')).key}`;
  });
  afterAll(async () => { await app.close(); });

  it('rejects unauthenticated + invalid keys (401), tenant comes from the key', async () => {
    await http().get('/api/catalog').expect(401);
    await http().get('/api/catalog').set('Authorization', 'Bearer bogus').expect(401);
    await http().get('/api/catalog').set('Authorization', t1).expect(200);
  });

  it('GET /api/catalog lists connectors + transports', async () => {
    const res = await http().get('/api/catalog').set('Authorization', t1).expect(200);
    expect(res.body.connectors.map((c: any) => c.id).sort()).toEqual(['amazon', 'csv', 'database', 'generic-rest', 'quickbooks', 'shopify', 'xlsx']);
    expect(res.body.transports.map((t: any) => t.id).sort()).toEqual(['sftp', 'webhook']);
  });

  it('PUT then GET /api/relationships round-trips config, tenant-scoped by the key', async () => {
    const rel: TradingRelationship = {
      id: 'rel-1', tenantId: 'ignored', partnerId: 'acme', formatAuthority: 'client', tenantRole: 'buyer',
      version: '004010', mode: 'test',
      envelope: { senderQualifier: 'ZZ', senderId: 'ACME', receiverQualifier: 'ZZ', receiverId: 'RET', gsVersion: '004010' },
      documents: [{ docType: '850', direction: 'inbound', mapId: 'm-in', specId: 'house-850', connectorInstanceId: 'ci', enabled: true }],
      active: true,
    };
    await http().put('/api/relationships/rel-1').set('Authorization', t1).send(rel).expect(200);

    const list = await http().get('/api/relationships').set('Authorization', t1).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: 'rel-1', tenantId: 't1', partnerId: 'acme', documents: [{ docType: '850', mapId: 'm-in' }] });

    // a different tenant's key sees nothing (isolation enforced by the authenticated tenant)
    expect((await http().get('/api/relationships').set('Authorization', t2).expect(200)).body).toEqual([]);
    await http().get('/api/relationships/nope').set('Authorization', t1).expect(404);
  });

  it('POST /api/connectors/import-sample profiles a sample; PUT persists an instance', async () => {
    const csv = 'PO_Number,Order_Date,Item_SKU,Qty,Unit_Price\n4500,2026-07-31,A1,10,18.50\n';
    const prof = await http().post('/api/connectors/import-sample').set('Authorization', t1).send({ type: 'csv', sample: csv, docType: '850' }).expect(201);
    expect(prof.body.fields.find((f: any) => f.path === 'PO_Number').suggestion.target).toBe('poNumber');
    await http().post('/api/connectors/import-sample').set('Authorization', t1).send({ type: 'csv' }).expect(400);

    const inst = {
      id: 'ci-1', tenantId: 'ignored', connectorType: 'csv', settings: { hasHeader: true }, docTypes: ['850'], trigger: 'file-drop',
      connectorMap: { connector: 'csv', docType: '850', direction: 'inbound', header: [{ to: 'poNumber', from: 'PO_Number' }] },
    };
    await http().put('/api/connectors/ci-1').set('Authorization', t1).send(inst).expect(200);
    const got = await http().get('/api/connectors/ci-1').set('Authorization', t1).expect(200);
    expect(got.body).toMatchObject({ id: 'ci-1', tenantId: 't1', connectorType: 'csv', docTypes: ['850'] });

    // delete (CRUD): removes it; a second delete 404s; t2 cannot delete t1's connector
    await http().delete('/api/connectors/ci-1').set('Authorization', t2).expect(404);
    await http().delete('/api/connectors/ci-1').set('Authorization', t1).expect(200);
    await http().get('/api/connectors/ci-1').set('Authorization', t1).expect(404);
    await http().delete('/api/connectors/ci-1').set('Authorization', t1).expect(404);
  });

  it('provisions specs / partner-maps / transports (the rest of the config graph)', async () => {
    const spec = { docType: '850', version: '004010', owner: 'client', segments: [{ tag: 'BEG', requirement: 'mandatory', elements: [] }] };
    await http().put('/api/specs/house-850').set('Authorization', t1).send(spec).expect(200);
    expect((await http().get('/api/specs/house-850').set('Authorization', t1).expect(200)).body).toMatchObject({ docType: '850', owner: 'client' });

    const pmap = { docType: '850', direction: 'inbound', functionalId: 'PO', segments: [] };
    await http().put('/api/partner-maps/acme-850-in').set('Authorization', t1).send(pmap).expect(200);
    expect((await http().get('/api/partner-maps/acme-850-in').set('Authorization', t1).expect(200)).body).toMatchObject({ docType: '850' });

    const tp = { id: 'tp-1', tenantId: 'ignored', transportType: 'sftp', settings: { host: 'sftp.acme.com' }, vaultRef: 'vault://1', direction: 'both' };
    await http().put('/api/transports/tp-1').set('Authorization', t1).send(tp).expect(200);
    expect((await http().get('/api/transports').set('Authorization', t1).expect(200)).body[0]).toMatchObject({ id: 'tp-1', transportType: 'sftp', tenantId: 't1' });
  });

  it('GET /api/documents serves persisted transactions (key-scoped)', async () => {
    const txns = app.get(TransactionRepository);
    await txns.save({
      tenantId: 't1', relationshipId: 'rel-1', direction: 'inbound', docType: '850',
      transactionControlNumber: '0001', functionalGroupControlNumber: '1', currentState: 'DELIVERED', conformant: true,
      receivedAt: '2026-08-02T09:00:00.000Z',
      doc: { meta: { docType: '850', direction: 'inbound', partner: '', tenantId: 't1' }, poNumber: '4500', lineItems: [{ ids: [{ type: 'UP', value: 'A1' }], quantity: { value: 2 } }] } as any,
    });
    const res = await http().get('/api/documents').set('Authorization', t1).expect(200);
    expect(res.body.items.map((d: any) => d.poNumber)).toContain('4500');
    expect(res.body.total).toBe(1);
    // partner-scoped + pagination: filter by relationshipId, and an unknown one is empty
    expect((await http().get('/api/documents?relationshipId=rel-1&limit=10').set('Authorization', t1).expect(200)).body.total).toBe(1);
    expect((await http().get('/api/documents?relationshipId=nope').set('Authorization', t1).expect(200)).body.items).toEqual([]);
    // t2's key must not see t1's documents
    expect((await http().get('/api/documents').set('Authorization', t2).expect(200)).body.items).toEqual([]);
  });

  it('GET /api/review serves the queue; dismiss resolves it', async () => {
    const ledger = app.get(ProcessingRepository);
    const ev = await ledger.record({
      tenantId: 't1', relationshipId: 'rel-1', outcome: 'rejected', source: 'sftp:x', receivedAt: '2026-08-02T09:00:00.000Z',
      artifactId: 'a1', dedupKey: 'k1', occurrence: 1, delivered: false, needsReview: true,
    });
    expect((await http().get('/api/review').set('Authorization', t1).expect(200)).body.map((e: any) => e.id)).toContain(ev.id);
    // partner-scoped queue: filtering by relationship keeps it; a different relationship excludes it
    expect((await http().get('/api/review?relationshipId=rel-1').set('Authorization', t1).expect(200)).body.map((e: any) => e.id)).toContain(ev.id);
    expect((await http().get('/api/review?relationshipId=other').set('Authorization', t1).expect(200)).body).toEqual([]);
    await http().post(`/api/review/${ev.id}/dismiss`).set('Authorization', t1).send({ resolvedBy: 'ops', note: 'waived' }).expect(201);
    expect((await http().get('/api/review').set('Authorization', t1).expect(200)).body.map((e: any) => e.id)).not.toContain(ev.id);
  });

  it('certification: open session → drop a good 855 → gate opens → certify (auth + tenant-scoped)', async () => {
    await http().post('/api/certification/sessions').expect(401); // guard applies here too

    const rel: TradingRelationship = {
      id: 'cert-rel', tenantId: 'ignored', partnerId: 'acme', formatAuthority: 'client', tenantRole: 'buyer',
      version: '004010', mode: 'test',
      envelope: { senderQualifier: 'ZZ', senderId: 'US', receiverQualifier: 'ZZ', receiverId: 'ACME', gsVersion: '004010' },
      documents: [{ docType: '855', direction: 'inbound', mapId: '', enabled: true }],
      active: true,
    };
    await http().put('/api/relationships/cert-rel').set('Authorization', t1).send(rel).expect(200);

    const opened = await http().post('/api/certification/sessions').set('Authorization', t1).send({ relationshipId: 'cert-rel' }).expect(201);
    const sessionId = opened.body.session.id;
    const doc855 = opened.body.docs.find((d: any) => d.docType === '855');
    expect(doc855.blocking).toBe(true);

    // Blocked until the response passes.
    await http().post(`/api/certification/sessions/${sessionId}/certify`).set('Authorization', t1).send({ certifiedBy: 'ops' }).expect(409);

    const good855 = ['BAK*00*AC*4500*20260731~', 'PO1*1*10*EA*18.50**UP*012345678905~', 'ACK*IA*10*EA~', 'CTT*1~'].join('\n');
    const dropped = await http().post(`/api/certification/docs/${doc855.id}/files`).set('Authorization', t1).send({ bytes: good855, uploadedBy: 'partner' }).expect(201);
    expect(dropped.body.verdict).toBe('passed'); // conformance vs built-in house 855 spec

    await http().post(`/api/certification/sessions/${sessionId}/certify`).set('Authorization', t1).send({ certifiedBy: 'ops' }).expect(201);
    const detail = await http().get(`/api/certification/sessions/${sessionId}`).set('Authorization', t1).expect(200);
    expect(detail.body.session.status).toBe('certified');

    // t2 cannot see t1's session.
    await http().get(`/api/certification/sessions/${sessionId}`).set('Authorization', t2).expect(404);
  });

  it('Shopify webhook: verifies HMAC → splits by vendor → persists 850s (idempotent); holds unmapped; 401 on bad sig', async () => {
    const SECRET = 'whsec_demo';
    await app.get(ShopifyRegistrationRepository).upsert({
      tenantId: 't1', shopDomain: 'test.myshopify.com', secret: SECRET,
      prefixes: [{ vendorId: 'wh-vendor-a', prefix: 'A-' }, { vendorId: 'wh-vendor-b', prefix: 'B-' }],
    });
    const order = (lines: any[]) => JSON.stringify({ id: 555, name: '#555', currency: 'USD', created_at: '2026-08-05T10:00:00Z', line_items: lines, shipping_address: { name: 'X', city: 'NYC', country_code: 'US' } });
    const post = (body: string, wid: string, secret = SECRET) =>
      http().post('/api/webhooks/shopify').set('Content-Type', 'application/json')
        .set('X-Shopify-Shop-Domain', 'test.myshopify.com').set('X-Shopify-Webhook-Id', wid)
        .set('X-Shopify-Hmac-Sha256', createHmac('sha256', secret).update(body).digest('base64')).send(body);

    // clean split → 2 vendor 850s persisted
    const good = order([{ id: 1, sku: 'A-1', quantity: 2, price: '5.00' }, { id: 2, sku: 'B-2', quantity: 1, price: '3.00' }]);
    const res = await post(good, 'wh-1').expect(200);
    expect(res.body).toMatchObject({ status: 'processed', routed: 2, held: false });
    expect((await http().get('/api/documents?relationshipId=wh-vendor-a').set('Authorization', t1).expect(200)).body.total).toBe(1);

    // idempotent: same webhook id → no re-persist
    await post(good, 'wh-1').expect(200).then((r) => expect(r.body.status).toBe('duplicate'));
    expect((await http().get('/api/documents?relationshipId=wh-vendor-a').set('Authorization', t1).expect(200)).body.total).toBe(1);

    // bad signature → 401
    await post(good, 'wh-x', 'wrong-secret').expect(401);

    // held: an unmapped SKU → not routed, recorded as a review exception
    const bad = order([{ id: 1, sku: 'A-1', quantity: 1, price: '5.00' }, { id: 2, sku: 'ZZ-9', quantity: 1, price: '1.00' }]);
    await post(bad, 'wh-2').expect(200).then((r) => expect(r.body).toMatchObject({ status: 'processed', held: true, unmapped: ['ZZ-9'] }));
    expect((await http().get('/api/review?relationshipId=wh-vendor-a').set('Authorization', t1).expect(200)).body.some((e: any) => e.needsReview)).toBe(true);

    // a Shopify test order is skipped
    await post(JSON.stringify({ id: 9, test: true, currency: 'USD', line_items: [] }), 'wh-3').expect(200).then((r) => expect(r.body.status).toBe('skipped-test'));

    // unknown shop → 404
    await http().post('/api/webhooks/shopify').set('X-Shopify-Shop-Domain', 'nope.myshopify.com').set('X-Shopify-Hmac-Sha256', 'x').send('{}').expect(404);
  });

  it('product catalog: client CRUD (upsert/bulk/list/delete); partners are forbidden', async () => {
    await http().post('/api/product-catalog').set('Authorization', t1).send({ sellableSku: 'WIDGET', vendorId: 'ridgeline', vendorSku: 'RDG-1', packSize: 12, uom: 'CA' }).expect(201);
    await http().post('/api/product-catalog/bulk').set('Authorization', t1).send({ entries: [
      { sellableSku: 'GADGET', vendorId: 'summit', vendorSku: 'SMT-9' },
      { sellableSku: '', vendorId: 'x', vendorSku: 'y' }, // invalid → skipped
    ] }).expect(201).then((r) => { expect(r.body).toEqual({ upserted: 1, skipped: 1 }); });
    const list = (await http().get('/api/product-catalog').set('Authorization', t1).expect(200)).body;
    expect(list.map((e: any) => e.sellableSku).sort()).toEqual(['GADGET', 'WIDGET']);
    await http().delete('/api/product-catalog?sellableSku=WIDGET&vendorId=ridgeline').set('Authorization', t1).expect(200);
    expect((await http().get('/api/product-catalog').set('Authorization', t1).expect(200)).body).toHaveLength(1);
    expect((await http().get('/api/product-catalog').set('Authorization', t2).expect(200)).body).toEqual([]); // tenant-scoped

    // a partner user is forbidden
    await http().post('/api/auth/users').set('Authorization', t1).send({ email: 'pc@partner.co', password: 'pw', role: 'partner' }).expect(201);
    const pt = `Bearer ${(await http().post('/api/auth/login').send({ email: 'pc@partner.co', password: 'pw' }).expect(201)).body.token}`;
    await http().get('/api/product-catalog').set('Authorization', pt).expect(403);
  });

  it('RBAC: a scoped partner logs in, sees only its session, can drop a file but cannot certify', async () => {
    // Two relationships under t1; a partner is scoped to only one of them.
    for (const id of ['rbac-a', 'rbac-b']) {
      const rel: TradingRelationship = {
        id, tenantId: 'ignored', partnerId: id, formatAuthority: 'client', tenantRole: 'buyer', version: '004010', mode: 'test',
        envelope: { senderQualifier: 'ZZ', senderId: 'US', receiverQualifier: 'ZZ', receiverId: 'P', gsVersion: '004010' },
        documents: [{ docType: '855', direction: 'inbound', mapId: '', enabled: true }], active: true,
      };
      await http().put(`/api/relationships/${id}`).set('Authorization', t1).send(rel).expect(200);
    }
    const sA = (await http().post('/api/certification/sessions').set('Authorization', t1).send({ relationshipId: 'rbac-a' }).expect(201)).body;
    const sB = (await http().post('/api/certification/sessions').set('Authorization', t1).send({ relationshipId: 'rbac-b' }).expect(201)).body;

    // client_admin (api key) provisions a partner login scoped to rbac-a only.
    await http().post('/api/auth/users').set('Authorization', t1).send({ email: 'partner@acme.com', password: 'pw', role: 'partner', scopes: ['rbac-a'] }).expect(201);

    // login is public.
    const login = await http().post('/api/auth/login').send({ email: 'partner@acme.com', password: 'pw' }).expect(201);
    const pt = `Bearer ${login.body.token}`;
    expect(login.body.role).toBe('partner');
    expect((await http().get('/api/auth/me').set('Authorization', pt).expect(200)).body.scopes).toEqual(['rbac-a']);

    // partner sees only its scoped session in the list.
    const visible = (await http().get('/api/certification/sessions').set('Authorization', pt).expect(200)).body;
    expect(visible.map((s: any) => s.id)).toEqual([sA.session.id]);

    // partner may drop a file on its own doc...
    const docA = sA.docs.find((d: any) => d.docType === '855');
    const good855 = ['BAK*00*AC*4500*20260731~', 'PO1*1*10*EA*18.50**UP*012345678905~', 'ACK*IA*10*EA~', 'CTT*1~'].join('\n');
    await http().post(`/api/certification/docs/${docA.id}/files`).set('Authorization', pt).send({ bytes: good855, uploadedBy: 'partner' }).expect(201);

    // ...but cannot certify (client-only)...
    await http().post(`/api/certification/sessions/${sA.session.id}/certify`).set('Authorization', pt).send({ certifiedBy: 'x' }).expect(403);

    // ...and cannot touch the session it isn't scoped to.
    await http().get(`/api/certification/sessions/${sB.session.id}`).set('Authorization', pt).expect(403);
    const docB = sB.docs.find((d: any) => d.docType === '855');
    await http().post(`/api/certification/docs/${docB.id}/files`).set('Authorization', pt).send({ bytes: good855, uploadedBy: 'partner' }).expect(403);

    // the client can still certify rbac-a (its blocking 855 now passes).
    await http().post(`/api/certification/sessions/${sA.session.id}/certify`).set('Authorization', t1).send({ certifiedBy: 'ops' }).expect(201);
  });
});
