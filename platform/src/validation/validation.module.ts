import { Module } from '@nestjs/common';
import { ConformanceValidator } from './conformance-validator';

/**
 * Validation module — Layer-2 spec/IG conformance. Pure; the control plane selects which spec to
 * validate against (via format_authority) and calls this after the engine.
 */
@Module({
  providers: [ConformanceValidator],
  exports: [ConformanceValidator],
})
export class ValidationModule {}
