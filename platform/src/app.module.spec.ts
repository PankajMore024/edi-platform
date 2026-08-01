import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { InboundPipeline } from './control-plane/inbound-pipeline';
import { QuarantineResolver } from './control-plane/quarantine-resolver';
import { IntegrationOrchestrator } from './control-plane/integration-orchestrator';
import { ConnectorRegistry } from './connectors/connector-registry';
import { TransportRegistry } from './transport/transport-registry';
import { ProcessingLedger } from './intake/processing-ledger';
import { InboundGateway } from './intake/inbound-gateway';
import { FunctionalAckService } from './ack/functional-ack.service';

/**
 * Whole-app DI smoke test. `nest build` only type-checks; this instantiates the real container so a
 * missing provider, unexported dependency, or bad injection token in the module wiring fails HERE
 * (in CI) instead of at runtime. It also confirms the connector + transport catalogs are populated.
 */
describe('AppModule (DI graph boots)', () => {
  it('resolves the full control-plane + intake + transport graph and populates the catalogs', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    // Every cross-module composition point resolves (these have the deepest dependency chains).
    expect(moduleRef.get(InboundPipeline)).toBeInstanceOf(InboundPipeline);
    expect(moduleRef.get(QuarantineResolver)).toBeInstanceOf(QuarantineResolver);
    expect(moduleRef.get(IntegrationOrchestrator)).toBeInstanceOf(IntegrationOrchestrator);
    expect(moduleRef.get(InboundGateway)).toBeInstanceOf(InboundGateway);
    expect(moduleRef.get(FunctionalAckService)).toBeInstanceOf(FunctionalAckService);
    expect(moduleRef.get(ProcessingLedger)).toBeDefined();

    // Adapters self-registered into their catalogs at construction.
    expect(moduleRef.get(ConnectorRegistry).list().map((d) => d.id).sort())
      .toEqual(['amazon', 'csv', 'database', 'generic-rest', 'quickbooks', 'shopify', 'xlsx']);
    expect(moduleRef.get(TransportRegistry).list().map((d) => d.id).sort()).toEqual(['sftp', 'webhook']);

    await moduleRef.close();
  });
});
