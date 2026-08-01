import { Module } from '@nestjs/common';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { ObjectMapper } from './object-mapper';
import { ConnectorRegistry } from './connector-registry';
import { CsvConnector } from './adapters/csv.connector';
import { XlsxConnector } from './adapters/xlsx.connector';
import { DatabaseConnector } from './adapters/database.connector';
import { GenericRestConnector } from './adapters/generic-rest.connector';
import { ShopifyConnector } from './adapters/shopify.connector';
import { AmazonConnector } from './adapters/amazon.connector';
import { QuickBooksConnector } from './adapters/quickbooks.connector';

/**
 * Connectors — the customer edge. Core (ObjectMapper + ConnectorRegistry) + one provider per
 * connector adapter. Adapters self-register into the registry at startup (constructor), so adding a
 * connector = adding a provider here. Isolates each connector's deps; each is a future
 * microservice-extraction seam.
 */
@Module({
  imports: [ReferenceDataModule],
  providers: [
    ObjectMapper,
    ConnectorRegistry,
    CsvConnector,
    XlsxConnector,
    DatabaseConnector,
    GenericRestConnector,
    ShopifyConnector,
    AmazonConnector,
    QuickBooksConnector,
  ],
  exports: [ObjectMapper, ConnectorRegistry],
})
export class ConnectorsModule {}
