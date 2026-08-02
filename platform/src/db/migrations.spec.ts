import { sql } from 'kysely';
import { createDatabase } from './database';
import { createSchema, ALL_TABLES } from './migrations';

describe('createSchema (node:sqlite)', () => {
  it('creates every table in the schema, idempotently', async () => {
    const db = createDatabase({ sqliteFile: ':memory:' });
    await createSchema(db);
    await createSchema(db); // second run is a no-op (ifNotExists) — must not throw

    const rows = await sql<{ name: string }>`select name from sqlite_master where type = 'table'`.execute(db);
    const names = rows.rows.map((r) => r.name);
    for (const t of ALL_TABLES) expect(names).toContain(t);

    await db.destroy();
  });
});
