import { ConnectorRegistry } from './connector-registry';
import { ObjectMapper } from './object-mapper';
import { CsvConnector } from './adapters/csv.connector';
import { GenericRestConnector } from './adapters/generic-rest.connector';

describe('ConnectorRegistry', () => {
  it('connectors self-register; get/list work; unknown throws', () => {
    const reg = new ConnectorRegistry();
    const mapper = new ObjectMapper();
    new CsvConnector(mapper, reg); // self-registers in ctor
    new GenericRestConnector(mapper, reg);

    expect(reg.list().map((d) => d.id).sort()).toEqual(['csv', 'generic-rest']);
    expect(reg.get('csv').type).toBe('csv');
    expect(reg.list().find((d) => d.id === 'csv')).toMatchObject({ kind: 'connector', class: 'file' });
    expect(() => reg.get('nope')).toThrow(/not registered/);
  });
});
