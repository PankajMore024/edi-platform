import { Module } from '@nestjs/common';
import { MappingModule } from '../mapping/mapping.module';
import { EnvelopeModule } from '../envelope/envelope.module';
import { ValidationModule } from '../validation/validation.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { X12Module } from '../x12/x12.module';
import { IntakeModule } from '../intake/intake.module';
import { AckModule } from '../ack/ack.module';
import { MapRegistry } from './map-registry';
import { SpecRegistry } from './spec-registry';
import { RelationshipStore } from './relationship-store';
import { TranslationPipeline } from './translation-pipeline';
import { ConnectorInstanceStore } from './connector-instance-store';
import { IntegrationOrchestrator } from './integration-orchestrator';
import { InboundPipeline } from './inbound-pipeline';
import { QuarantineResolver } from './quarantine-resolver';
import { ConfigLoader } from './config-loader';

/**
 * Control plane — the config layer that GOVERNS the pure engine. Registries hold the declarative
 * building blocks (maps, specs, relationships); TranslationPipeline composes engine + validator +
 * envelope, driven by a TradingRelationship. This is the substrate the admin console and AI
 * onboarding both operate on.
 */
@Module({
  imports: [MappingModule, EnvelopeModule, ValidationModule, ConnectorsModule, X12Module, IntakeModule, AckModule],
  providers: [
    MapRegistry,
    SpecRegistry,
    RelationshipStore,
    TranslationPipeline,
    ConnectorInstanceStore,
    IntegrationOrchestrator,
    InboundPipeline,
    QuarantineResolver,
    ConfigLoader,
  ],
  exports: [
    MapRegistry,
    SpecRegistry,
    RelationshipStore,
    TranslationPipeline,
    ConnectorInstanceStore,
    IntegrationOrchestrator,
    InboundPipeline,
    QuarantineResolver,
    ConfigLoader,
  ],
})
export class ControlPlaneModule {}
