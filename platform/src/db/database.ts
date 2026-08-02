import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { NodeSqliteDialect } from './node-sqlite.dialect';
import { DB } from './schema';

/** DI token for the shared `Kysely<DB>` instance. */
export const DATABASE = Symbol('DATABASE');

export interface DatabaseOptions {
  /** Postgres connection string (production). When set, uses the PostgresDialect. */
  url?: string;
  /** sqlite file or ':memory:' (tests / local). Used when `url` is absent. */
  sqliteFile?: string;
}

/**
 * Build a Kysely instance. Postgres in production (via DATABASE_URL); node:sqlite otherwise so the
 * whole DB layer runs in-process for tests and local dev with no native build. Same repositories and
 * SQL surface either way — Kysely compiles to each dialect.
 */
export function createDatabase(opts: DatabaseOptions = {}): Kysely<DB> {
  if (opts.url) {
    return new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: opts.url }) }) });
  }
  return new Kysely<DB>({ dialect: new NodeSqliteDialect({ filename: opts.sqliteFile ?? ':memory:' }) });
}
