import { Global, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from './schema';
import { DATABASE, createDatabase } from './database';
import { createSchema } from './migrations';
import { RawArtifactRepository } from './repositories/raw-artifact.repository';
import { DedupRepository } from './repositories/dedup.repository';
import { ProcessingRepository } from './repositories/processing.repository';
import { ControlNumberRepository } from './repositories/control-number.repository';
import { RelationshipRepository } from './repositories/relationship.repository';
import { DocSpecRepository, PartnerMapRepository, ConnectorMapRepository, TransportInstanceRepository } from './repositories/config-repositories';
import { TransactionRepository } from './repositories/transaction.repository';
import { DbLifecycleSink } from './repositories/lifecycle-sink.repository';
import { ConnectorInstanceRepository } from './repositories/connector-instance.repository';

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
    { provide: ControlNumberRepository, useFactory: (db: Kysely<DB>) => new ControlNumberRepository(db), inject: [DATABASE] },
    { provide: RelationshipRepository, useFactory: (db: Kysely<DB>) => new RelationshipRepository(db), inject: [DATABASE] },
    { provide: DocSpecRepository, useFactory: (db: Kysely<DB>) => new DocSpecRepository(db), inject: [DATABASE] },
    { provide: PartnerMapRepository, useFactory: (db: Kysely<DB>) => new PartnerMapRepository(db), inject: [DATABASE] },
    { provide: ConnectorMapRepository, useFactory: (db: Kysely<DB>) => new ConnectorMapRepository(db), inject: [DATABASE] },
    { provide: TransportInstanceRepository, useFactory: (db: Kysely<DB>) => new TransportInstanceRepository(db), inject: [DATABASE] },
    { provide: TransactionRepository, useFactory: (db: Kysely<DB>) => new TransactionRepository(db), inject: [DATABASE] },
    { provide: DbLifecycleSink, useFactory: (db: Kysely<DB>) => new DbLifecycleSink(db), inject: [DATABASE] },
    { provide: ConnectorInstanceRepository, useFactory: (db: Kysely<DB>) => new ConnectorInstanceRepository(db), inject: [DATABASE] },
  ],
  exports: [
    DATABASE, RawArtifactRepository, DedupRepository, ProcessingRepository,
    ControlNumberRepository, RelationshipRepository, DocSpecRepository, PartnerMapRepository,
    ConnectorMapRepository, TransportInstanceRepository, TransactionRepository, DbLifecycleSink,
    ConnectorInstanceRepository,
  ],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}
  async onModuleInit(): Promise<void> { await createSchema(this.db); }
  async onModuleDestroy(): Promise<void> { await this.db.destroy(); }
}
