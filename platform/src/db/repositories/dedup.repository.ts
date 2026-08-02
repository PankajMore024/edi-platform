import { randomUUID } from 'crypto';
import { Kysely, sql } from 'kysely';
import { DB } from '../schema';
import { DedupRecord } from '../../intake/dedup.store';

/**
 * Durable idempotency ledger (the DB form of DedupStore). `register` is an atomic upsert keyed on
 * (tenant, dedup_key): first occurrence inserts with occurrences=1, subsequent ones increment — so
 * the same interchange can never be processed twice. Multi-tenant.
 */
export class DedupRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async register(tenantId: string, key: string, artifactId: string, fingerprint: string, at: Date): Promise<DedupRecord> {
    await this.db.insertInto('dedup_ledger')
      .values({
        id: randomUUID(), tenant_id: tenantId, dedup_key: key,
        first_artifact_id: artifactId, first_fingerprint: fingerprint, first_seen_at: at.toISOString(), occurrences: 1,
      })
      .onConflict((oc) => oc.columns(['tenant_id', 'dedup_key']).doUpdateSet({ occurrences: sql`occurrences + 1` }))
      .execute();
    return (await this.lookup(tenantId, key)) as DedupRecord;
  }

  async lookup(tenantId: string, key: string): Promise<DedupRecord | undefined> {
    const r = await this.db.selectFrom('dedup_ledger').selectAll()
      .where('tenant_id', '=', tenantId).where('dedup_key', '=', key).executeTakeFirst();
    return r ? {
      key: r.dedup_key, firstArtifactId: r.first_artifact_id, firstFingerprint: r.first_fingerprint,
      firstSeenAt: r.first_seen_at, occurrences: r.occurrences,
    } : undefined;
  }
}
