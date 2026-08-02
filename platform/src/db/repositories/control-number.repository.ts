import { randomUUID } from 'crypto';
import { Kysely, sql } from 'kysely';
import { DB } from '../schema';

/**
 * Durable, ATOMIC control-number allocation (ISA13 / GS06 / ST02), scoped by (tenant, scope). Replaces
 * the in-memory ControlNumberService, whose non-persistence + non-atomicity is a top source of real EDI
 * incidents (duplicate/raced control numbers). The upsert-then-read runs inside a transaction so each
 * caller gets a distinct, monotonic value even under concurrency; a durable store means numbers never
 * reset on restart.
 */
export class ControlNumberRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /** Allocate the next number for `scope`, starting at `start` on first use. */
  async next(tenantId: string, scope: string, start = 1): Promise<string> {
    const value = await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('control_number_seq')
        .values({ id: randomUUID(), tenant_id: tenantId, scope, current_value: start })
        .onConflict((oc) => oc.columns(['tenant_id', 'scope']).doUpdateSet({ current_value: sql`current_value + 1` }))
        .execute();
      const row = await trx.selectFrom('control_number_seq').select('current_value')
        .where('tenant_id', '=', tenantId).where('scope', '=', scope).executeTakeFirstOrThrow();
      return row.current_value;
    });
    return String(value);
  }

  /** Zero-padded variant (e.g. ISA13 width 9, ST02 width 4). */
  async nextPadded(tenantId: string, scope: string, width: number, start = 1): Promise<string> {
    return (await this.next(tenantId, scope, start)).padStart(width, '0').slice(-width);
  }
}
