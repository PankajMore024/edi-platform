import { DocType, Direction } from '../mapping/dsl/map.types';
import { EnvelopeConfig } from '../envelope/envelope.service';

/**
 * Control-plane configuration — the declarative "building blocks" that GOVERN the pure engine.
 * All config here is plain, JSON-serializable data (no code) so it can be:
 *   - authored by AI onboarding,
 *   - rendered/edited by the (future) admin console as draggable components,
 *   - round-tripped as JSON (export/import a whole relationship).
 * The engine stays config-blind; this layer selects its inputs and wraps validation.
 */

export type FormatAuthority = 'client' | 'partner';
export type TenantRole = 'buyer' | 'supplier';

/**
 * Metadata every control-plane building block exposes — powers the admin console's component
 * library/palette (list, search, drag-in). See docs/design/admin-console.md.
 */
export interface ComponentDescriptor {
  id: string;
  kind: 'map' | 'spec' | 'relationship' | 'connector';
  name: string;
  description?: string;
}

/** One doc type in one direction within a relationship: which map + which governing spec. */
export interface RelationshipDocument {
  docType: DocType;
  direction: Direction;
  mapId: string;
  /** Governing spec (house spec if client-authoritative; partner IG if partner-authoritative). */
  specId?: string;
  /** Customer-edge connector instance for this doc (native ⇄ canonical). */
  connectorInstanceId?: string;
  enabled: boolean;
}

/**
 * The successor to a `kon_x12settings` row: one configured tenant↔partner relationship.
 * `formatAuthority` is the "which way" switch (D48). Fully declarative — the console reads/writes
 * exactly this object.
 */
export interface TradingRelationship {
  id: string;
  tenantId: string;
  partnerId: string;
  partnerName?: string;
  formatAuthority: FormatAuthority;
  tenantRole: TenantRole;
  version: string;
  mode: 'test' | 'prod';
  envelope: EnvelopeConfig;
  documents: RelationshipDocument[];
  active: boolean;
}

export type { DocType, Direction };
