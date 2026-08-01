import { Test } from '@nestjs/testing';
import { ConnectorsModule } from './connectors.module';
import { ConnectorRegistry } from './connector-registry';

/**
 * DI smoke test: boot the real module and prove every adapter self-registers under its own type.
 * Regression guard for the base-constructor bug where `this.type` was read before subclass field
 * init — every payload connector registered under `undefined` and collapsed to a single entry.
 */
describe('ConnectorsModule (DI graph)', () => {
  it('registers all connectors, each under a distinct type', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConnectorsModule] }).compile();
    const registry = moduleRef.get(ConnectorRegistry);

    const ids = registry.list().map((d) => d.id).sort();
    expect(ids).toEqual(['amazon', 'csv', 'database', 'generic-rest', 'quickbooks', 'shopify', 'xlsx']);

    // each type resolves back to a connector whose descriptor id matches (not overwritten)
    for (const id of ids) {
      expect(registry.get(id).descriptor().id).toBe(id);
    }

    await moduleRef.close();
  });
});
