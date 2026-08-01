import { Injectable } from '@nestjs/common';
import { CanonicalDocument } from '../../canonical/types/document.types';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { Connector, ConnectorDescriptor, ConnectorInstance } from '../connector.types';

/**
 * Database connector (ERPs / legacy apps on a SQL DB). Translates a provided ROWSET (array of record
 * objects) ↔ canonical via the shared ObjectMapper — column names/types/joins vary via the
 * connector-map, exactly like the file connectors.
 *
 * ⚠️ Running the live SQL (connect, SELECT for ingest / INSERT-UPSERT for emit) is a credential- and
 * driver-dependent TRANSPORT concern (DB transport, deferred) — NOT here. This connector operates on
 * a rowset the transport hands it, so it is fully real and testable without a database.
 */
@Injectable()
export class DatabaseConnector implements Connector {
  readonly type = 'database';

  constructor(
    private readonly mapper: ObjectMapper,
    registry: ConnectorRegistry,
  ) {
    registry.register(this);
  }

  descriptor(): ConnectorDescriptor {
    return { id: 'database', kind: 'connector', class: 'database', name: 'Database (SQL)', description: 'SQL rowset ↔ canonical; live query via the DB transport' };
  }

  /** A query result set (array of row objects) → canonical document. */
  async ingest(raw: unknown, instance: ConnectorInstance): Promise<CanonicalDocument[]> {
    if (!Array.isArray(raw)) {
      throw new Error('database connector expects an array of row objects (a query result set)');
    }
    const doc = this.mapper.ingest(raw, instance.connectorMap) as any;
    doc.meta.tenantId = instance.tenantId;
    return [doc];
  }

  /** Canonical document → rows to upsert into the customer DB (the transport runs the write). */
  async emitData(doc: CanonicalDocument, instance: ConnectorInstance): Promise<unknown> {
    return this.mapper.emit(doc, instance.connectorMap);
  }
}
