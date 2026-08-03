import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { TransportModule } from '../transport/transport.module';
import { ControlPlaneModule } from '../control-plane/control-plane.module';
import { CatalogController } from './catalog.controller';
import { RelationshipsController } from './relationships.controller';
import { ConnectorsController } from './connectors.controller';
import { DocumentsController } from './documents.controller';
import { ReviewController } from './review.controller';

/**
 * HTTP API — the console/provisioning backend over the control plane. Read models (catalog, documents,
 * review queue) + config provisioning (relationships). Repositories come from the global DatabaseModule;
 * QuarantineResolver from the control plane; the catalogs from the connector/transport registries.
 */
@Module({
  imports: [ConnectorsModule, TransportModule, ControlPlaneModule],
  controllers: [CatalogController, RelationshipsController, ConnectorsController, DocumentsController, ReviewController],
})
export class ApiModule {}
