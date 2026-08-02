// Minimal ambient types for Node's built-in sqlite (stable in Node 22+), which @types/node@20 predates.
// Only the surface the test dialect uses is declared.
declare module 'node:sqlite' {
  export class StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
  }
  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
