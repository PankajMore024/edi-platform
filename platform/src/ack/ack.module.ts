import { Module } from '@nestjs/common';
import { FunctionalAckService } from './functional-ack.service';

/**
 * Acknowledgment — generates 997 Functional Acknowledgments for received functional groups. Pure
 * body generation; enveloping is EnvelopeService's job. A future microservice-extraction seam.
 */
@Module({
  providers: [FunctionalAckService],
  exports: [FunctionalAckService],
})
export class AckModule {}
