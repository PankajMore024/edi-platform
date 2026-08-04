import { Kysely } from 'kysely';
import { createDatabase } from '../database';
import { createSchema } from '../migrations';
import { DB } from '../schema';
import { UserRepository } from './user.repository';

describe('UserRepository (console users, scopes, sessions — node:sqlite)', () => {
  let db: Kysely<DB>;
  let repo: UserRepository;
  beforeEach(async () => { db = createDatabase({ sqliteFile: ':memory:' }); await createSchema(db); repo = new UserRepository(db); });
  afterEach(async () => { await db.destroy(); });

  it('creates a user and logs in with the right password (case-insensitive email), rejecting wrong ones', async () => {
    await repo.createUser({ tenantId: 't1', email: 'Ops@Client.com', role: 'client_ops', password: 'hunter2' });
    expect(await repo.login('ops@client.com', 'wrong')).toBeUndefined();
    const ok = await repo.login('ops@client.com', 'hunter2');
    expect(ok).toBeDefined();
    expect(ok!.principal).toMatchObject({ tenantId: 't1', role: 'client_ops', email: 'ops@client.com', scopes: [] });
    expect(ok!.token.startsWith('usr_')).toBe(true);
  });

  it('resolves a session token to the principal with fresh scopes', async () => {
    const u = await repo.createUser({ tenantId: 't1', email: 'p@acme.com', role: 'partner', password: 'pw' });
    await repo.addScope(u.id, 'rel-1');
    const { token } = (await repo.login('p@acme.com', 'pw'))!;
    const principal = await repo.resolveSession(token);
    expect(principal).toMatchObject({ tenantId: 't1', role: 'partner', scopes: ['rel-1'] });
  });

  it('logout revokes the session token', async () => {
    await repo.createUser({ tenantId: 't1', email: 'x@y.com', role: 'partner', password: 'pw' });
    const { token } = (await repo.login('x@y.com', 'pw'))!;
    await repo.logout(token);
    expect(await repo.resolveSession(token)).toBeUndefined();
  });

  it('never stores the password in plaintext', async () => {
    await repo.createUser({ tenantId: 't1', email: 'z@y.com', role: 'partner', password: 'sup3rsecret' });
    const row = await db.selectFrom('console_user').selectAll().where('email', '=', 'z@y.com').executeTakeFirst();
    expect(row!.password_hash).not.toContain('sup3rsecret');
    expect(row!.password_salt.length).toBeGreaterThan(0);
  });
});
