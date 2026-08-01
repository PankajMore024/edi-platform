import { Module } from '@nestjs/common';
import { TransportRegistry } from './transport-registry';
import { SftpTransport } from './adapters/sftp.transport';
import { WebhookTransport } from './adapters/webhook.transport';

/**
 * Transport — how bytes move (distinct from connectors, which translate). Adapters self-register into
 * the registry at startup. SFTP/webhook are honest stubs (real descriptor + config validation; live
 * I/O deferred to a credentialed environment). A future microservice-extraction seam.
 */
@Module({
  providers: [TransportRegistry, SftpTransport, WebhookTransport],
  exports: [TransportRegistry],
})
export class TransportModule {}
