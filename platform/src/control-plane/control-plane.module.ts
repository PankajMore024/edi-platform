import { Module } from '@nestjs/common';
import { MappingModule } from '../mapping/mapping.module';
import { EnvelopeModule } from '../envelope/envelope.module';
import { ValidationModule } from '../validation/validation.module';
import { MapRegistry } from './map-registry';
import { SpecRegistry } from './spec-registry';
import { RelationshipStore } from './relationship-store';
import { TranslationPipeline } from './translation-pipeline';

/**
 * Control plane — the config layer that GOVERNS the pure engine. Registries hold the declarative
 * building blocks (maps, specs, relationships); TranslationPipeline composes engine + validator +
 * envelope, driven by a TradingRelationship. This is the substrate the admin console and AI
 * onboarding both operate on.
 */
@Module({
  imports: [MappingModule, EnvelopeModule, ValidationModule],
  providers: [MapRegistry, SpecRegistry, RelationshipStore, TranslationPipeline],
  exports: [MapRegistry, SpecRegistry, RelationshipStore, TranslationPipeline],
})
export class ControlPlaneModule {}
