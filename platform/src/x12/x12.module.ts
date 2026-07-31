import { Module } from '@nestjs/common';
import { X12Service } from './x12.service';

/** X12 module — isolates the raw serialization library (node-x12) behind X12Service. */
@Module({
  providers: [X12Service],
  exports: [X12Service],
})
export class X12Module {}
