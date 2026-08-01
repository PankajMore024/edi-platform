import { Injectable } from '@nestjs/common';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorDescriptor } from '../connector.types';
import { FileConnector } from './file-connector.base';

/** CSV file connector — delimited text via SFTP or upload. Edge cases (quotes, embedded delimiters/
 * newlines, BOM) handled by csv-parse; delimiter/header vary via parse-config. */
@Injectable()
export class CsvConnector extends FileConnector {
  constructor(mapper: ObjectMapper, registry: ConnectorRegistry) {
    super('csv', mapper, registry);
  }

  descriptor(): ConnectorDescriptor {
    return { id: 'csv', kind: 'connector', class: 'file', name: 'CSV file', description: 'Delimited text (CSV/TSV) via SFTP or upload' };
  }
}
