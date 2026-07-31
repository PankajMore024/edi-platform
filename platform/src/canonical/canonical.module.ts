import { Module } from '@nestjs/common';

/**
 * Canonical module — owns the version-agnostic business-document types and (M1) their JSON-Schema
 * validation. Pure contracts; no runtime dependencies. Everything else maps to/from these shapes.
 */
@Module({
  providers: [],
  exports: [],
})
export class CanonicalModule {}
