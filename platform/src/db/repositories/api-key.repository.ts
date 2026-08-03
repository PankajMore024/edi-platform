import { createHash, randomBytes, randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';

const hash = (key: string): string => createHash('sha256').update(key, 'utf8').digest('hex');

/**
 * Tenant API keys. Only the sha256 HASH is stored — the plaintext key is shown once at issue time and
 * never recoverable. `resolve` maps a presented key to its (non-revoked) tenant; that's how a request's
 * tenant is established, so it can't be spoofed via a header.
 */
export class ApiKeyRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /** Issue a new key for a tenant. Returns the plaintext ONCE (store it now — only the hash is kept). */
  async issue(tenantId: string, name: string): Promise<{ id: string; key: string }> {
    const key = `edi_${randomBytes(24).toString('hex')}`;
    const id = randomUUID();
    await this.db.insertInto('api_key').values({
      id, tenant_id: tenantId, name, key_hash: hash(key), created_at: new Date().toISOString(), revoked: 0,
    }).execute();
    return { id, key };
  }

  /** The tenant a live key belongs to, or undefined if unknown/revoked. */
  async resolve(key: string): Promise<string | undefined> {
    const r = await this.db.selectFrom('api_key').select('tenant_id')
      .where('key_hash', '=', hash(key)).where('revoked', '=', 0).executeTakeFirst();
    return r?.tenant_id;
  }

  async revoke(id: string): Promise<void> {
    await this.db.updateTable('api_key').set({ revoked: 1 }).where('id', '=', id).execute();
  }
}
