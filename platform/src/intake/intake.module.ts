import { Module } from '@nestjs/common';
import { X12Module } from '../x12/x12.module';
import { InboundGateway } from './inbound-gateway';
import { RawArtifactStore } from './raw-artifact.store';
import { DedupStore } from './dedup.store';
import { ProcessingLedger } from './processing-ledger';
import { TransactionStore } from './transaction-store';
import { LifecycleSink } from './lifecycle-sink';
import { RawArtifactRepository } from '../db/repositories/raw-artifact.repository';
import { DedupRepository } from '../db/repositories/dedup.repository';
import { ProcessingRepository } from '../db/repositories/processing.repository';
import { TransactionRepository } from '../db/repositories/transaction.repository';
import { DbLifecycleSink } from '../db/repositories/lifecycle-sink.repository';

/**
 * Intake — the inbound trust boundary (immutable raw retention + idempotent dedup + lifecycle ledger).
 * The abstract stores are bound to the DURABLE Kysely repositories (provided by the global
 * DatabaseModule), so the running app persists to Postgres/sqlite. Unit tests still construct the
 * in-memory implementations directly against the same async contracts.
 */
@Module({
  imports: [X12Module],
  providers: [
    InboundGateway,
    { provide: RawArtifactStore, useExisting: RawArtifactRepository },
    { provide: DedupStore, useExisting: DedupRepository },
    { provide: ProcessingLedger, useExisting: ProcessingRepository },
    { provide: TransactionStore, useExisting: TransactionRepository },
    { provide: LifecycleSink, useExisting: DbLifecycleSink },
  ],
  exports: [InboundGateway, RawArtifactStore, DedupStore, ProcessingLedger, TransactionStore, LifecycleSink],
})
export class IntakeModule {}
