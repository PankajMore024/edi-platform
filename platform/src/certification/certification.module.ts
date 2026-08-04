import { Module } from '@nestjs/common';
import { X12Module } from '../x12/x12.module';
import { MappingModule } from '../mapping/mapping.module';
import { ValidationModule } from '../validation/validation.module';
import { CertificationService } from './certification.service';
import { CertificationController } from './certification.controller';

/**
 * Certification/onboarding board backend. Composes the durable certification repository (global
 * DatabaseModule) with the engine services (parse/ingest/conformance) to validate dropped test files.
 */
@Module({
  imports: [X12Module, MappingModule, ValidationModule],
  providers: [CertificationService],
  controllers: [CertificationController],
  exports: [CertificationService],
})
export class CertificationModule {}
