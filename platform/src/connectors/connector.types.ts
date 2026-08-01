import { DocType, Direction } from '../mapping/dsl/map.types';
import { CanonicalDocument } from '../canonical/types/document.types';

/**
 * Connector SDK — the customer edge. A connector implements the Ingest-data / Emit-data primitives,
 * mirroring the engine's Emit-EDI / Ingest-EDI on the partner edge. The shared interface with the
 * engine is the CANONICAL document. See docs/design/connector-layer.md.
 *
 * A connector = a thin adapter (transport/auth/parse) + a declarative connector-map, interpreted by
 * the ObjectMapper. Variation is DATA (parse-config + connector-map + reference tables), not code.
 */

/**
 * Transform operators (fixed function library — NO arbitrary code). Applied as an ordered chain on
 * ingest. `crossref`/`multiplyByLookup` draw on the reference-data subsystem.
 */
export type TransformSpec =
  | { op: 'multiply'; by: number }
  | { op: 'divide'; by: number } // e.g. cents → dollars: divide by 100
  | { op: 'round'; places: number }
  | { op: 'trim' }
  | { op: 'upper' }
  | { op: 'lower' }
  | { op: 'crossref'; table: string } // source code → canonical code (e.g. UOM CS→CA)
  | { op: 'multiplyByLookup'; table: string; keyFrom: string; get: string } // e.g. cases → eaches × packSize
  | { op: 'divideByLookup'; table: string; keyFrom: string; get: string }; // reverse of multiplyByLookup: eaches → cases ÷ packSize

/** One source-field → canonical-field binding (customer-edge mapping). */
export interface ConnectorFieldMap {
  /** Canonical path to write (e.g. "poNumber", "quantity.value", "ids.0.value"). */
  to: string;
  /** Source path/column to read (dotted path; a flat column name is a single segment). */
  from?: string;
  const?: string | number | boolean;
  default?: string | number;
  /** Ordered transform chain applied on INGEST (native → canonical): unit conversions, code cross-refs. */
  transform?: TransformSpec[];
  /**
   * Ordered transform chain applied on EMIT (canonical → native). Deliberately EXPLICIT, not an
   * auto-inverted `transform`: several ops are lossy (round/trim/upper/lower cannot be undone), so
   * auto-inversion would silently corrupt values. Authors supply the true reverse chain (e.g. ingest
   * `divide 100` ⇄ emit `multiply 100`; ingest `multiplyByLookup` ⇄ emit `divideByLookup`).
   */
  emitTransform?: TransformSpec[];
  /** Coerce the (post-transform) value to a number. */
  decimal?: number;
}

/**
 * Connector-map: native shape → canonical. `header` fields come from the record (or the first row of
 * an array); `lineFields` build the canonical line array (`lineTo`) from a source array (`lineOver`)
 * or, for flat files, from the rows themselves.
 */
export interface ConnectorMap {
  connector: string;
  docType: DocType;
  direction: Direction;
  header: ConnectorFieldMap[];
  lineTo?: string;
  lineOver?: string;
  lineFields?: ConnectorFieldMap[];
}

/** A configured connector for a tenant. Declarative; creds resolve from the vault via `auth.vaultRef`. */
export interface ConnectorInstance {
  id: string;
  tenantId: string;
  connectorType: string;
  auth?: { vaultRef: string };
  settings: Record<string, unknown>; // e.g. flat-file parse config
  connectorMap: ConnectorMap;
  docTypes: DocType[];
  trigger: 'webhook' | 'poll' | 'file-drop' | 'manual';
}

/** Standalone (not importing control-plane) so connectors don't depend on the control plane. */
export interface ConnectorDescriptor {
  id: string;
  kind: 'connector';
  name: string;
  description?: string;
  class: 'file' | 'api' | 'ecommerce' | 'erp' | 'database';
}

/**
 * The uniform connector contract. Every connector type implements this. Both directions are async:
 * real connectors do I/O (parse a binary xlsx, fetch an API, read SFTP, refresh OAuth), so the edge
 * is a Promise even when a given adapter happens to be synchronous internally.
 */
export interface Connector {
  readonly type: string;
  descriptor(): ConnectorDescriptor;
  /** Native payload (file bytes / JSON object) → canonical documents. */
  ingest(raw: unknown, instance: ConnectorInstance): Promise<CanonicalDocument[]>;
  /** Canonical document → native payload (CSV/xlsx bytes / JSON object) for delivery to the customer. */
  emitData(doc: CanonicalDocument, instance: ConnectorInstance): Promise<unknown>;
}
