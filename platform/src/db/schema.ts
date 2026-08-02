/**
 * The database schema, typed for Kysely. Two planes:
 *   - CONFIG  — master data (tenants, relationships, connectors, maps, specs, transports). Slow-changing,
 *               versioned, low volume. The durable form of the in-memory control-plane stores.
 *   - LIFECYCLE — the transactional record of every document: immutable raw retention, dedup, the
 *               canonical intermediate + its state machine, processing events, acks, delivery, dispatch.
 *
 * Portability note: booleans are stored as INTEGER 0/1, timestamps + JSON as TEXT (ISO / JSON string),
 * so the identical schema runs on Postgres (prod) and node:sqlite (tests). Repositories map these to
 * domain types (0/1 → boolean, JSON string → object). pg-native jsonb/timestamptz is a later refinement.
 */

type Bool = number; // 0 | 1
type Json = string; // serialized JSON
type Ts = string; // ISO-8601

// ── CONFIG PLANE ────────────────────────────────────────────────────────────
export interface TenantTable { id: string; name: string; created_at: Ts; }
export interface TradingPartnerTable { id: string; tenant_id: string; name: string; isa_qualifier: string; isa_id: string; created_at: Ts; }
export interface TradingRelationshipTable {
  id: string; tenant_id: string; partner_id: string;
  mode: string; // 'sandbox' | 'production'
  format_authority: string; tenant_role: string; version: string;
  envelope: Json; active: Bool; version_no: number; created_at: Ts; updated_at: Ts;
}
export interface RelationshipDocumentTable {
  id: string; relationship_id: string; doc_type: string; direction: string;
  spec_id: string | null; partner_map_id: string | null; connector_instance_id: string | null; enabled: Bool;
}
export interface ConnectorInstanceTable {
  id: string; tenant_id: string; connector_type: string; name: string;
  settings: Json; vault_ref: string | null; trigger: string; created_at: Ts;
}
export interface ConnectorMapTable {
  id: string; tenant_id: string; connector_instance_id: string; doc_type: string; direction: string;
  definition: Json; version_no: number; created_at: Ts;
}
export interface PartnerMapTable {
  id: string; tenant_id: string; doc_type: string; direction: string; definition: Json; version_no: number; created_at: Ts;
}
export interface DocSpecTable {
  id: string; tenant_id: string; doc_type: string; version: string; owner: string; definition: Json; created_at: Ts;
}
export interface TransportInstanceTable {
  id: string; tenant_id: string; transport_type: string; settings: Json; vault_ref: string | null; direction: string; created_at: Ts;
}
export interface ControlNumberSeqTable { id: string; tenant_id: string; scope: string; current_value: number; }
export interface ConfigAuditTable {
  id: string; tenant_id: string; entity_type: string; entity_id: string; action: string;
  actor: string; before: Json | null; after: Json | null; at: Ts;
}

// ── LIFECYCLE PLANE ─────────────────────────────────────────────────────────
export interface RawArtifactTable {
  id: string; // sha256 content address
  tenant_id: string; source: string; bytes: string; size: number; received_at: Ts;
}
export interface DedupLedgerTable {
  id: string; tenant_id: string; dedup_key: string;
  first_artifact_id: string; first_fingerprint: string; first_seen_at: Ts; occurrences: number;
}
export interface InterchangeTable {
  id: string; tenant_id: string; relationship_id: string | null; artifact_id: string; direction: string;
  dedup_key: string; isa13: string; sender_id: string; receiver_id: string;
  status: string; occurrence: number; conflict: Bool; received_at: Ts;
}
/**
 * Class-Table Inheritance for documents:
 *   - `transaction` = the SHARED SUPERTYPE: only fields common to every doc type + lifecycle. Cross-
 *     type ops/dashboards query here. No sparse doc-specific columns.
 *   - `transaction_<doc>` = per-doc-type SUBTYPE (1:1 by transaction_id): ONLY that type's header
 *     fields. No nulls-for-other-types, no duplicated common columns.
 *   - generic recurring structures (line/party/reference/date) are shared child tables; where a doc
 *     type adds LINE-level fields, a line subtype (`transaction_line_<doc>`) hangs off transaction_line.
 * Amounts/quantities are TEXT decimal strings (exact — no float money). Lifecycle = column updates +
 * append-only event rows (no rewritten blob). No JSON blob is the query path.
 */
export interface TransactionTable {
  id: string; tenant_id: string; relationship_id: string | null; interchange_id: string | null; direction: string;
  doc_type: string; transaction_control_number: string; functional_group_control_number: string;
  po_number: string | null; // the one business key common to all their doc types
  line_count: number; current_state: string; conformant: Bool; reason: string | null;
  received_at: Ts; validated_at: string | null; delivered_at: string | null; acknowledged_at: string | null;
  created_at: Ts; updated_at: Ts;
}

// ── per-doc-type header subtypes (1:1 via transaction_id) ──
/** 850 (BEG). */
export interface Txn850Table { transaction_id: string; tenant_id: string; purpose_code: string | null; po_type: string | null; po_date: string | null; requested_ship_date: string | null; }
/** 810 (BIG/TDS/ITD). */
export interface Txn810Table { transaction_id: string; tenant_id: string; invoice_number: string; invoice_date: string | null; total_amount: string | null; tax_amount: string | null; terms: string | null; }
/** 855 (BAK): BAK01 purpose, BAK02 acknowledgment type, BAK04 date. */
export interface Txn855Table { transaction_id: string; tenant_id: string; purpose_code: string | null; ack_type: string | null; ack_date: string | null; }
/** 856 (BSN/TD1/TD5). */
export interface Txn856Table {
  transaction_id: string; tenant_id: string; shipment_id: string | null; purpose: string | null; ship_date: string | null;
  carrier_scac: string | null; tracking_number: string | null; gross_weight: string | null; weight_uom: string | null; package_count: number | null;
}

// ── generic line items + per-doc-type line subtypes ──
export interface TransactionLineTable {
  id: string; tenant_id: string; transaction_id: string; line_number: number | null;
  sku: string | null; sku_qualifier: string | null; // promoted PRIMARY identifier for fast queries
  quantity: string | null; uom: string | null; unit_price: string | null; amount: string | null; description: string | null;
}
/** A line's product identifiers (PO1 id-pairs: UP/VN/BP…) — 1:N, since a line carries several. `sku`
 * on transaction_line is the promoted primary; this holds the full set for cross-reference matching. */
export interface TransactionLineIdentifierTable { id: string; tenant_id: string; line_id: string; qualifier: string; value: string; }
/** 856 line (SN1/MAN): what actually shipped for this line. */
export interface Line856Table { line_id: string; tenant_id: string; shipped_quantity: string | null; ordered_quantity: string | null; uom: string | null; carton_id: string | null; }
/** 855 line: the per-item purchase-order acknowledgment. */
export interface Line855Table { line_id: string; tenant_id: string; ack_status: string | null; ack_quantity: string | null; reason: string | null; }

/** N1 loops (ship-to, bill-to, vendor…) — `role` is the party qualifier. */
export interface TransactionPartyTable {
  id: string; tenant_id: string; transaction_id: string; role: string;
  name: string | null; id_code: string | null; id_qualifier: string | null;
  address1: string | null; address2: string | null; city: string | null; region: string | null; postal: string | null; country: string | null;
}
/** REF segments (qualifier → value). */
export interface TransactionReferenceTable { id: string; tenant_id: string; transaction_id: string; qualifier: string; value: string; }
/** DTM segments (qualifier → date). */
export interface TransactionDateTable { id: string; tenant_id: string; transaction_id: string; qualifier: string; value: string; }
export interface TransactionEventTable { id: string; tenant_id: string; transaction_id: string; state: string; detail: Json | null; at: Ts; }
export interface ProcessingEventTable {
  id: string; tenant_id: string; relationship_id: string; transaction_id: string | null; interchange_id: string | null;
  outcome: string; source: string; received_at: Ts; artifact_id: string; dedup_key: string; occurrence: number;
  doc_type: string | null; functional_group_control_number: string | null; transaction_control_number: string | null;
  first_artifact_id: string | null; first_seen_at: string | null; valid: Bool | null; error_count: number | null;
  delivered: Bool; ack_control_number: string | null; needs_review: Bool; note: string | null;
  resolution: string | null; resolved_at: string | null; resolved_by: string | null; resolution_note: string | null;
  resolution_event_id: string | null; created_at: Ts;
}
export interface ConformanceIssueTable {
  id: string; transaction_id: string; level: string; segment_tag: string; segment_position: number;
  element_position: number | null; error_code: string; bad_value: string | null; message: string;
}
export interface AcknowledgmentTable {
  id: string; tenant_id: string; relationship_id: string; interchange_id: string | null; ack_type: string;
  control_number: string; group_control_number: string; edi: string; ak9: string | null;
  dispatched: Bool; dispatched_at: string | null; created_at: Ts;
}
export interface DeliveryTable {
  id: string; tenant_id: string; transaction_id: string; connector_instance_id: string | null;
  format: string; payload: string; delivered_at: Ts; status: string;
}
export interface DispatchQueueTable {
  id: string; tenant_id: string; ack_id: string | null; transaction_id: string | null; transport_instance_id: string | null;
  status: string; attempts: number; next_attempt_at: string | null; created_at: Ts;
}

/** The Kysely database. Pass as `Kysely<DB>`. */
export interface DB {
  tenant: TenantTable;
  trading_partner: TradingPartnerTable;
  trading_relationship: TradingRelationshipTable;
  relationship_document: RelationshipDocumentTable;
  connector_instance: ConnectorInstanceTable;
  connector_map: ConnectorMapTable;
  partner_map: PartnerMapTable;
  doc_spec: DocSpecTable;
  transport_instance: TransportInstanceTable;
  control_number_seq: ControlNumberSeqTable;
  config_audit: ConfigAuditTable;
  raw_artifact: RawArtifactTable;
  dedup_ledger: DedupLedgerTable;
  interchange: InterchangeTable;
  transaction: TransactionTable;
  transaction_850: Txn850Table;
  transaction_810: Txn810Table;
  transaction_855: Txn855Table;
  transaction_856: Txn856Table;
  transaction_line: TransactionLineTable;
  transaction_line_identifier: TransactionLineIdentifierTable;
  transaction_line_855: Line855Table;
  transaction_line_856: Line856Table;
  transaction_party: TransactionPartyTable;
  transaction_reference: TransactionReferenceTable;
  transaction_date: TransactionDateTable;
  transaction_event: TransactionEventTable;
  processing_event: ProcessingEventTable;
  conformance_issue: ConformanceIssueTable;
  acknowledgment: AcknowledgmentTable;
  delivery: DeliveryTable;
  dispatch_queue: DispatchQueueTable;
}
