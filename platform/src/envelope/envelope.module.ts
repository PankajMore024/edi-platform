import { Module } from '@nestjs/common';
import { EnvelopeService } from './envelope.service';
import { ControlNumberService } from './control-number.service';

/**
 * Envelope module — ISA/GS/ST build/parse (harvested from ediTemplateParser.js, now bidirectional
 * with correct SE/GE/IEA trailers) + control-number allocation.
 */
@Module({
  providers: [EnvelopeService, ControlNumberService],
  exports: [EnvelopeService, ControlNumberService],
})
export class EnvelopeModule {}
