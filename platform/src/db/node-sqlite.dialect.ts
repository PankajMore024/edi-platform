import {
  CompiledQuery, DatabaseConnection, DatabaseIntrospector, Dialect, DialectAdapter, Driver,
  Kysely, QueryCompiler, QueryResult, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler,
} from 'kysely';
import { DatabaseSync } from 'node:sqlite';

/**
 * A minimal Kysely dialect over Node's built-in `node:sqlite` (Node 22+). Used for TESTS — it runs
 * in-process with zero native build, so the DB layer is verifiable in CI. Production uses the
 * PostgresDialect (same repositories, same SQL surface — Kysely compiles to each). sqlite's lax type
 * affinity accepts the pg-native column types we declare (jsonb/timestamptz/boolean) as text/integer.
 */
export interface NodeSqliteDialectConfig {
  /** ':memory:' for tests, or a file path. */
  filename: string;
}

export class NodeSqliteDialect implements Dialect {
  constructor(private readonly config: NodeSqliteDialectConfig) {}
  createAdapter(): DialectAdapter { return new SqliteAdapter(); }
  createDriver(): Driver { return new NodeSqliteDriver(this.config.filename); }
  createQueryCompiler(): QueryCompiler { return new SqliteQueryCompiler(); }
  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector { return new SqliteIntrospector(db); }
}

class NodeSqliteDriver implements Driver {
  private db!: DatabaseSync;
  private connection!: NodeSqliteConnection;

  constructor(private readonly filename: string) {}

  async init(): Promise<void> {
    this.db = new DatabaseSync(this.filename);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.connection = new NodeSqliteConnection(this.db);
  }
  async acquireConnection(): Promise<DatabaseConnection> { return this.connection; }
  async beginTransaction(conn: DatabaseConnection): Promise<void> { (conn as NodeSqliteConnection).exec('BEGIN'); }
  async commitTransaction(conn: DatabaseConnection): Promise<void> { (conn as NodeSqliteConnection).exec('COMMIT'); }
  async rollbackTransaction(conn: DatabaseConnection): Promise<void> { (conn as NodeSqliteConnection).exec('ROLLBACK'); }
  async releaseConnection(): Promise<void> { /* single shared connection */ }
  async destroy(): Promise<void> { this.db.close(); }
}

class NodeSqliteConnection implements DatabaseConnection {
  constructor(private readonly db: DatabaseSync) {}

  exec(sql: string): void { this.db.exec(sql); }

  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    const stmt = this.db.prepare(compiled.sql);
    const params = compiled.parameters.map(coerceParam);
    if (/^\s*(select|pragma|with)/i.test(compiled.sql)) {
      return { rows: stmt.all(...params) as R[] };
    }
    const res = stmt.run(...params);
    return {
      rows: [],
      numAffectedRows: BigInt(res.changes),
      insertId: res.lastInsertRowid == null ? undefined : BigInt(res.lastInsertRowid),
    };
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('streaming is not supported by the node:sqlite test dialect');
  }
}

/** node:sqlite only binds null | number | bigint | string | Uint8Array — coerce JS values to those. */
function coerceParam(v: unknown): null | number | bigint | string | Uint8Array {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string' || v instanceof Uint8Array) return v;
  return String(v);
}
