import { Injectable } from '@nestjs/common';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorDescriptor } from '../connector.types';
import { FileConnector } from './file-connector.base';

/** Excel (.xlsx) file connector — binary workbook via SFTP or upload. Handles typed cells, formula
 * results, dates, and refuses Excel error cells (see FileConnector.cellToString). Payload is a Buffer. */
@Injectable()
export class XlsxConnector extends FileConnector {
  constructor(mapper: ObjectMapper, registry: ConnectorRegistry) {
    super('xlsx', mapper, registry);
  }

  descriptor(): ConnectorDescriptor {
    return { id: 'xlsx', kind: 'connector', class: 'file', name: 'Excel (.xlsx)', description: 'Excel workbook via SFTP or upload (typed cells, formulas)' };
  }
}
