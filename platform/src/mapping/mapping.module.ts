import { Module } from '@nestjs/common';
import { X12Module } from '../x12/x12.module';
import { EnvelopeModule } from '../envelope/envelope.module';
import { EmitService } from './engine/emit.service';
import { IngestService } from './engine/ingest.service';
import { MapValidator } from './dsl/map-validator';

/**
 * Mapping module — the deterministic translation engine. Depends on X12 (raw serialization) and
 * Envelope (ISA/GS/ST). Interprets EdiMap declaratively in both directions:
 *   EmitService   canonical -> X12
 *   IngestService X12       -> canonical
 *   MapValidator  Layer-1 shape validation (load-time gate)
 *
 * This module is the heart of the "partners are data, not code" thesis.
 */
@Module({
  imports: [X12Module, EnvelopeModule],
  providers: [EmitService, IngestService, MapValidator],
  exports: [EmitService, IngestService, MapValidator],
})
export class MappingModule {}
