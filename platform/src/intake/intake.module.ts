import { Module } from '@nestjs/common';
import { X12Module } from '../x12/x12.module';
import { InboundGateway } from './inbound-gateway';
import { RawArtifactStore, InMemoryRawArtifactStore } from './raw-artifact.store';
import { DedupStore, InMemoryDedupStore } from './dedup.store';

/**
 * Intake — the inbound trust boundary (immutable raw retention + idempotent dedup). Stores are bound
 * to in-memory M1 implementations behind their abstract classes; a disk/S3/DB impl swaps in here
 * without touching InboundGateway. This is a future microservice-extraction seam.
 */
@Module({
  imports: [X12Module],
  providers: [
    InboundGateway,
    { provide: RawArtifactStore, useClass: InMemoryRawArtifactStore },
    { provide: DedupStore, useClass: InMemoryDedupStore },
  ],
  exports: [InboundGateway, RawArtifactStore, DedupStore],
})
export class IntakeModule {}
