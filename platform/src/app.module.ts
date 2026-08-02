import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CanonicalModule } from './canonical/canonical.module';
import { X12Module } from './x12/x12.module';
import { EnvelopeModule } from './envelope/envelope.module';
import { MappingModule } from './mapping/mapping.module';
import { ValidationModule } from './validation/validation.module';
import { ControlPlaneModule } from './control-plane/control-plane.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { IntakeModule } from './intake/intake.module';
import { AckModule } from './ack/ack.module';
import { TransportModule } from './transport/transport.module';
import { DatabaseModule } from './db/database.module';
import { ApiModule } from './api/api.module';

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

    // Persistence — durable master config + document lifecycle (Postgres in prod, node:sqlite otherwise)
    DatabaseModule,

    // Phase 1 — deterministic bidirectional core
    CanonicalModule,
    X12Module,
    EnvelopeModule,
    MappingModule,
    ValidationModule,

    // Control plane — config that governs the engine (composes the pure cores)
    ControlPlaneModule,

    // Phase 2 — connectors (customer edge)
    ConnectorsModule,

    // Phase 2 — intake (inbound trust boundary: immutable retention + idempotent dedup)
    IntakeModule,

    // Phase 2 — acknowledgments (997 functional acknowledgment generation)
    AckModule,

    // Phase 2 — transport (how bytes move: SFTP/webhook — composed with connectors)
    TransportModule,

    // Phase 3 — HTTP API (console / provisioning backend)
    ApiModule,
  ],
})
export class AppModule {}
