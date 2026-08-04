/**
 * Local dev seed — populates a file-backed sqlite DB with a demo tenant, logins, trading partners, and
 * real documents / exceptions / an onboarding session, so the console is a clickable, working app.
 *
 *   EDI_SQLITE_FILE=./edi-dev.sqlite npx ts-node -T src/seed.ts   (or: npm run seed)
 *
 * It RESETS the file each run. Not for production — dev fixtures only.
 */
import * as fs from 'fs';
import { createDatabase } from './db/database';
import { createSchema } from './db/migrations';
import { ApiKeyRepository } from './db/repositories/api-key.repository';
import { UserRepository } from './db/repositories/user.repository';
import { RelationshipRepository } from './db/repositories/relationship.repository';
import { DocSpecRepository, PartnerMapRepository, TransportInstanceRepository } from './db/repositories/config-repositories';
import { ConnectorInstanceRepository } from './db/repositories/connector-instance.repository';
import { TransactionRepository } from './db/repositories/transaction.repository';
import { ProcessingRepository } from './db/repositories/processing.repository';
import { CertificationRepository } from './db/repositories/certification.repository';
import { RawArtifactRepository } from './db/repositories/raw-artifact.repository';
import { CertificationService } from './certification/certification.service';
import { X12Service } from './x12/x12.service';
import { IngestService } from './mapping/engine/ingest.service';
import { EmitService } from './mapping/engine/emit.service';
import { ConformanceValidator } from './validation/conformance-validator';
import { HOUSE_850 } from './validation/specs/house850';
import { HOUSE_855 } from './validation/specs/house855';
import { HOUSE_856 } from './validation/specs/house856';
import { HOUSE_810 } from './validation/specs/house810';
import { HOUSE_846 } from './validation/specs/house846';
import { HOUSE_997 } from './validation/specs/house997';
import { SAMPLE_MAP, SAMPLE_DOC, SAMPLE_855_MAP, SAMPLE_855_DOC, SAMPLE_856_MAP, SAMPLE_856_DOC, SAMPLE_810_MAP, SAMPLE_810_DOC, SAMPLE_846_MAP, SAMPLE_997_MAP } from './testing/fixtures';
import { TradingRelationship, RelationshipDocument } from './control-plane/config.types';
import { CanonicalDocument } from './canonical/types/document.types';

const FILE = process.env.EDI_SQLITE_FILE ?? './edi-dev.sqlite';
const T = 'demo';
const PW = 'demo1234';
const iso = (dayOffset: number) => new Date(Date.UTC(2026, 7, 1 + dayOffset, 9, 0, 0)).toISOString();

async function main(): Promise<void> {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  const db = createDatabase({ sqliteFile: FILE });
  await createSchema(db);

  await db.insertInto('tenant').values({ id: T, name: 'Demo Dropship Co.', created_at: iso(0) }).execute();

  const key = await new ApiKeyRepository(db).issue(T, 'dev key');
  const users = new UserRepository(db);
  await users.createUser({ tenantId: T, email: 'admin@demo.co', role: 'client_admin', password: PW });
  const partnerUser = await users.createUser({ tenantId: T, email: 'partner@ridgeline.co', role: 'partner', password: PW });

  // specs + partner maps (referenced by the relationships' document flows)
  const specs = new DocSpecRepository(db);
  await specs.save(T, 'house-850', HOUSE_850); await specs.save(T, 'house-855', HOUSE_855);
  await specs.save(T, 'house-856', HOUSE_856); await specs.save(T, 'house-810', HOUSE_810);
  await specs.save(T, 'house-846', HOUSE_846); await specs.save(T, 'house-997', HOUSE_997);
  const maps = new PartnerMapRepository(db);
  await maps.save(T, 'ridgeline-850-out', SAMPLE_MAP); await maps.save(T, 'ridgeline-855-in', SAMPLE_855_MAP);
  await maps.save(T, 'ridgeline-856-in', SAMPLE_856_MAP); await maps.save(T, 'ridgeline-810-in', SAMPLE_810_MAP);
  await maps.save(T, 'ridgeline-846-in', SAMPLE_846_MAP); await maps.save(T, 'ridgeline-997-in', SAMPLE_997_MAP);

  await new ConnectorInstanceRepository(db).save({
    id: 'csv-ridgeline', tenantId: T, connectorType: 'csv', settings: { hasHeader: true },
    connectorMap: { connector: 'csv', docType: '850', direction: 'outbound', header: [{ to: 'poNumber', from: 'PO' }] },
    docTypes: ['850'], trigger: 'file-drop',
  });
  await new TransportInstanceRepository(db).save({
    id: 'sftp-ridgeline', tenantId: T, transportType: 'sftp',
    settings: { host: 'sftp.ridgeline.com', username: 'edi', inboundPath: '/out', outboundPath: '/in' },
    vaultRef: 'vault://sftp/ridgeline', direction: 'both',
  });

  const env = (sender: string, receiver: string) => ({ senderQualifier: 'ZZ', senderId: sender, receiverQualifier: 'ZZ', receiverId: receiver, gsVersion: '004010' });
  const flows: RelationshipDocument[] = [
    { docType: '850', direction: 'outbound', mapId: 'ridgeline-850-out', specId: 'house-850', connectorInstanceId: 'csv-ridgeline', enabled: true },
    { docType: '855', direction: 'inbound', mapId: 'ridgeline-855-in', specId: 'house-855', connectorInstanceId: 'csv-ridgeline', enabled: true },
    { docType: '856', direction: 'inbound', mapId: 'ridgeline-856-in', specId: 'house-856', connectorInstanceId: 'csv-ridgeline', enabled: true },
    { docType: '810', direction: 'inbound', mapId: 'ridgeline-810-in', specId: 'house-810', connectorInstanceId: 'csv-ridgeline', enabled: true },
    { docType: '846', direction: 'inbound', mapId: 'ridgeline-846-in', specId: 'house-846', connectorInstanceId: 'csv-ridgeline', enabled: true },
    { docType: '997', direction: 'inbound', mapId: 'ridgeline-997-in', specId: 'house-997', connectorInstanceId: 'csv-ridgeline', enabled: true },
  ];
  const rels = new RelationshipRepository(db);
  const rel = (over: Partial<TradingRelationship>): TradingRelationship => ({
    id: 'x', tenantId: T, partnerId: 'X', formatAuthority: 'client', tenantRole: 'buyer', version: '004010', mode: 'prod',
    envelope: env('DEMO', 'X'), documents: flows, active: true, ...over,
  });
  await rels.save(rel({ id: 'rel-ridgeline', partnerId: 'RIDGELINE', partnerName: 'Ridgeline Supply Co.', envelope: env('DEMO', 'RDG') }));
  await rels.save(rel({ id: 'rel-summit', partnerId: 'SUMMIT', partnerName: 'Summit Parts', envelope: env('DEMO', 'SMT'), documents: flows.slice(0, 2) }));
  await rels.save(rel({ id: 'rel-cascade', partnerId: 'CASCADE', partnerName: 'Cascade Foods', envelope: env('DEMO', 'CSC'), mode: 'test', active: false, documents: flows.slice(0, 2) }));
  await users.addScope(partnerUser.id, 'rel-ridgeline'); // the partner login sees only Ridgeline

  // documents for Ridgeline — enough to paginate, across doc types + states
  const txns = new TransactionRepository(db);
  const withPo = (doc: CanonicalDocument, po: string): CanonicalDocument => ({ ...(doc as object), poNumber: po } as CanonicalDocument);
  let ctrl = 1000;
  const save = (docType: string, direction: string, doc: CanonicalDocument, state: string, conformant: boolean, day: number) => {
    ctrl += 1;
    return txns.save({ tenantId: T, relationshipId: 'rel-ridgeline', direction, docType, transactionControlNumber: String(ctrl), functionalGroupControlNumber: '1', doc, currentState: state, conformant, receivedAt: iso(day) });
  };
  for (let i = 0; i < 10; i++) await save('850', 'outbound', withPo(SAMPLE_DOC, `PO-${4500 + i}`), 'DELIVERED', true, i);
  for (let i = 0; i < 6; i++) await save('855', 'inbound', withPo(SAMPLE_855_DOC, `PO-${4500 + i}`), 'ACCEPTED', true, i);
  for (let i = 0; i < 3; i++) await save('856', 'inbound', SAMPLE_856_DOC, 'DELIVERED', true, i);
  for (let i = 0; i < 2; i++) await save('810', 'inbound', withPo(SAMPLE_810_DOC, `PO-${4500 + i}`), 'DELIVERED', true, i);
  await save('810', 'inbound', withPo(SAMPLE_810_DOC, 'PO-4599'), 'REJECTED', false, 6);

  // an exception (held for review) on Ridgeline
  await new ProcessingRepository(db).record({
    tenantId: T, relationshipId: 'rel-ridgeline', outcome: 'conflict', source: 'sftp:ridgeline', receivedAt: iso(6),
    artifactId: 'seed-artifact-1', dedupKey: 'sha256:demo-conflict-1', occurrence: 2, docType: '810',
    delivered: false, needsReview: true, note: 'reused control number 000000123 with different content',
  });

  // onboarding sessions — seeded via the REAL service path so the board matches app behavior exactly
  // (one card per configured document flow). Ridgeline is the partner login's scoped board (all 6 doc
  // types); Cascade is a second, in-progress example for the client.
  const cert = new CertificationRepository(db);
  const svc = new CertificationService(
    cert, new RawArtifactRepository(db), rels, specs, maps,
    new X12Service(), new IngestService(), new EmitService(), new ConformanceValidator(),
  );
  await svc.openSession(T, 'rel-ridgeline');
  const cascade = await svc.openSession(T, 'rel-cascade');
  await cert.setSessionStatus(T, cascade.session.id, 'in_certification');

  await db.destroy();

  // eslint-disable-next-line no-console
  console.log(`\n✅ Seeded ${FILE}\n
  Sign in to the console (npm run dev in ../console):
    • Client admin — email  admin@demo.co        password  ${PW}
    • Partner (Ridgeline) — email  partner@ridgeline.co  password  ${PW}
    • Or API key (client_admin):  ${key.key}

  Partners: Ridgeline (live, 24 docs, 1 exception), Summit (live), Cascade (onboarding session).\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
