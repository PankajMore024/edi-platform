import { createHash } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import { RawArtifact } from '../../intake/intake.types';

/**
 * Durable, content-addressed raw-artifact retention (the DB form of RawArtifactStore). Identity is the
 * sha256 of the bytes, scoped per tenant; append-only, first-write-wins (a re-put of identical content
 * returns the original row). Multi-tenant: every call is scoped by `tenantId`.
 */
export class RawArtifactRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async put(tenantId: string, source: string, bytes: string, receivedAt: Date): Promise<RawArtifact> {
    const id = createHash('sha256').update(bytes, 'utf8').digest('hex');
    const existing = await this.get(tenantId, id);
    if (existing) return existing; // immutable: keep the first receipt of this content

    await this.db.insertInto('raw_artifact')
      .values({ id, tenant_id: tenantId, source, bytes, size: Buffer.byteLength(bytes, 'utf8'), received_at: receivedAt.toISOString() })
      .onConflict((oc) => oc.columns(['tenant_id', 'id']).doNothing()) // race-safe first-write-wins
      .execute();

    return (await this.get(tenantId, id)) as RawArtifact;
  }

  async get(tenantId: string, id: string): Promise<RawArtifact | undefined> {
    const r = await this.db.selectFrom('raw_artifact').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return r ? { id: r.id, source: r.source, bytes: r.bytes, size: r.size, receivedAt: r.received_at } : undefined;
  }
}
