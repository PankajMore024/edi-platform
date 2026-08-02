import { Global, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from './schema';
import { DATABASE, createDatabase } from './database';
import { createSchema } from './migrations';
import { RawArtifactRepository } from './repositories/raw-artifact.repository';
import { DedupRepository } from './repositories/dedup.repository';
import { ProcessingRepository } from './repositories/processing.repository';

/**
 * Provides the shared Kysely connection + durable repositories, and bootstraps the schema on startup.
 * Global so any module can inject a repository. Postgres in prod (DATABASE_URL); node:sqlite otherwise.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useFactory: () => createDatabase({ url: process.env.DATABASE_URL }) },
    { provide: RawArtifactRepository, useFactory: (db: Kysely<DB>) => new RawArtifactRepository(db), inject: [DATABASE] },
    { provide: DedupRepository, useFactory: (db: Kysely<DB>) => new DedupRepository(db), inject: [DATABASE] },
    { provide: ProcessingRepository, useFactory: (db: Kysely<DB>) => new ProcessingRepository(db), inject: [DATABASE] },
  ],
  exports: [DATABASE, RawArtifactRepository, DedupRepository, ProcessingRepository],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}
  async onModuleInit(): Promise<void> { await createSchema(this.db); }
  async onModuleDestroy(): Promise<void> { await this.db.destroy(); }
}
