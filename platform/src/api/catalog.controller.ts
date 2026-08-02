import { Controller, Get } from '@nestjs/common';
import { ConnectorRegistry } from '../connectors/connector-registry';
import { TransportRegistry } from '../transport/transport-registry';

/** Read-only catalog of the building blocks the console offers when configuring an integration. */
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly connectors: ConnectorRegistry,
    private readonly transports: TransportRegistry,
  ) {}

  @Get()
  all() {
    return { connectors: this.connectors.list(), transports: this.transports.list() };
  }

  @Get('connectors')
  connectorList() {
    return this.connectors.list();
  }

  @Get('transports')
  transportList() {
    return this.transports.list();
  }
}
