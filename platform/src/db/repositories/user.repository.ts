import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import { Role } from '../../api/principal';

const tokenHash = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
const hashPassword = (pw: string, salt: string): string => scryptSync(pw, salt, 64).toString('hex');

export interface ConsoleUser { id: string; tenantId: string; email: string; role: Role; }
export interface ResolvedPrincipal { tenantId: string; userId: string; email: string; role: Role; scopes: string[]; }

/**
 * Console users (per-user login) + their relationship scopes + login sessions. Passwords are salted +
 * scrypt-hashed (never stored plaintext); session tokens are stored only as a sha256 hash, like API keys.
 */
export class UserRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async createUser(input: { tenantId: string; email: string; role: Role; password: string }): Promise<ConsoleUser> {
    const salt = randomBytes(16).toString('hex');
    const id = randomUUID();
    await this.db.insertInto('console_user').values({
      id, tenant_id: input.tenantId, email: input.email.toLowerCase(), role: input.role,
      password_hash: hashPassword(input.password, salt), password_salt: salt, created_at: new Date().toISOString(), revoked: 0,
    }).execute();
    return { id, tenantId: input.tenantId, email: input.email.toLowerCase(), role: input.role };
  }

  async addScope(userId: string, relationshipId: string): Promise<void> {
    await this.db.insertInto('user_relationship_scope').values({ id: randomUUID(), user_id: userId, relationship_id: relationshipId }).execute();
  }

  private async scopesFor(userId: string): Promise<string[]> {
    const rows = await this.db.selectFrom('user_relationship_scope').select('relationship_id').where('user_id', '=', userId).execute();
    return rows.map((r) => r.relationship_id);
  }

  /** Verify credentials and, on success, issue a session token (returned once; only its hash is stored). */
  async login(email: string, password: string): Promise<{ token: string; principal: ResolvedPrincipal } | undefined> {
    const u = await this.db.selectFrom('console_user').selectAll().where('email', '=', email.toLowerCase()).where('revoked', '=', 0).executeTakeFirst();
    if (!u) return undefined;
    const candidate = scryptSync(password, u.password_salt, 64);
    const stored = Buffer.from(u.password_hash, 'hex');
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return undefined;

    const token = `usr_${randomBytes(24).toString('hex')}`;
    await this.db.insertInto('user_session').values({ id: randomUUID(), user_id: u.id, token_hash: tokenHash(token), created_at: new Date().toISOString(), revoked: 0 }).execute();
    return { token, principal: { tenantId: u.tenant_id, userId: u.id, email: u.email, role: u.role as Role, scopes: await this.scopesFor(u.id) } };
  }

  /** Resolve a presented session token to its principal (with fresh scopes), or undefined if unknown/revoked. */
  async resolveSession(token: string): Promise<ResolvedPrincipal | undefined> {
    const s = await this.db.selectFrom('user_session').select('user_id').where('token_hash', '=', tokenHash(token)).where('revoked', '=', 0).executeTakeFirst();
    if (!s) return undefined;
    const u = await this.db.selectFrom('console_user').selectAll().where('id', '=', s.user_id).where('revoked', '=', 0).executeTakeFirst();
    if (!u) return undefined;
    return { tenantId: u.tenant_id, userId: u.id, email: u.email, role: u.role as Role, scopes: await this.scopesFor(u.id) };
  }

  async logout(token: string): Promise<void> {
    await this.db.updateTable('user_session').set({ revoked: 1 }).where('token_hash', '=', tokenHash(token)).execute();
  }
}
