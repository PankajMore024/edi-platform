import { Module } from '@nestjs/common';
import { ReferenceDataStore } from './reference-data.store';

/** Reference-data — cross-reference + enrichment/master-data tables for transforms/lookups. */
@Module({
  providers: [ReferenceDataStore],
  exports: [ReferenceDataStore],
})
export class ReferenceDataModule {}
