import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CanonicalModule } from './canonical/canonical.module';
import { X12Module } from './x12/x12.module';
import { EnvelopeModule } from './envelope/envelope.module';
import { MappingModule } from './mapping/mapping.module';

/**
 * Root module.
 *
 * v1 phases add their modules here as they land (see docs/design/v1-phases.md):
 *   Phase 1 (now)  — Canonical · X12 · Envelope · Mapping   (the deterministic core)
 *   Phase 2        — Connector · Transport · Interchange
 *   Phase 3        — Sandbox · Onboarding (agentic)
 *   Phase 4        — Compliance
 *   Phase 5        — Inventory · Visibility
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Phase 1 — deterministic bidirectional core
    CanonicalModule,
    X12Module,
    EnvelopeModule,
    MappingModule,
  ],
})
export class AppModule {}
