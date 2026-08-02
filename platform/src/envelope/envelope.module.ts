import { Module } from '@nestjs/common';
import { EnvelopeService } from './envelope.service';
import { ControlNumberService } from './control-number.service';
import { ControlNumberRepository } from '../db/repositories/control-number.repository';

/**
 * Envelope module — ISA/GS/ST build/parse (bidirectional, correct SE/GE/IEA trailers) + control-number
 * allocation. ControlNumberService is bound to the durable, atomic ControlNumberRepository (from the
 * global DatabaseModule); unit tests inject InMemoryControlNumberService directly instead.
 */
@Module({
  providers: [
    EnvelopeService,
    { provide: ControlNumberService, useExisting: ControlNumberRepository },
  ],
  exports: [EnvelopeService, ControlNumberService],
})
export class EnvelopeModule {}
