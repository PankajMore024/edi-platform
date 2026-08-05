import { Kysely } from 'kysely';
import { DB } from './schema';

/**
 * Creates the full schema (both planes) idempotently. Portable column types only (text/integer) so
 * the same DDL runs on Postgres and node:sqlite. A production setup would use versioned migration
 * files + a lock table; this idempotent bootstrap is the M1 form.
 */
export async function createSchema(db: Kysely<DB>): Promise<void> {
  // ── config plane ──
  await db.schema.createTable('tenant').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('trading_partner').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('isa_qualifier', 'text', (c) => c.notNull())
    .addColumn('isa_id', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('trading_relationship').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('partner_id', 'text', (c) => c.notNull())
    .addColumn('mode', 'text', (c) => c.notNull())
    .addColumn('format_authority', 'text', (c) => c.notNull())
    .addColumn('tenant_role', 'text', (c) => c.notNull())
    .addColumn('version', 'text', (c) => c.notNull())
    .addColumn('envelope', 'text', (c) => c.notNull())
    .addColumn('active', 'integer', (c) => c.notNull())
    .addColumn('version_no', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('relationship_document').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('relationship_id', 'text', (c) => c.notNull())
    .addColumn('doc_type', 'text', (c) => c.notNull())
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('spec_id', 'text').addColumn('partner_map_id', 'text').addColumn('connector_instance_id', 'text')
    .addColumn('enabled', 'integer', (c) => c.notNull())
    .execute();

  await db.schema.createTable('connector_instance').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('connector_type', 'text', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('settings', 'text', (c) => c.notNull())
    .addColumn('vault_ref', 'text').addColumn('trigger', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('connector_map').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('connector_instance_id', 'text', (c) => c.notNull())
    .addColumn('doc_type', 'text', (c) => c.notNull())
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('definition', 'text', (c) => c.notNull())
    .addColumn('version_no', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('partner_map').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('doc_type', 'text', (c) => c.notNull())
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('definition', 'text', (c) => c.notNull())
    .addColumn('version_no', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('doc_spec').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('doc_type', 'text', (c) => c.notNull())
    .addColumn('version', 'text', (c) => c.notNull())
    .addColumn('owner', 'text', (c) => c.notNull())
    .addColumn('definition', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('transport_instance').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('transport_type', 'text', (c) => c.notNull())
    .addColumn('settings', 'text', (c) => c.notNull())
    .addColumn('vault_ref', 'text').addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('control_number_seq').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('scope', 'text', (c) => c.notNull())
    .addColumn('current_value', 'integer', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('control_number_seq_scope').ifNotExists().on('control_number_seq').columns(['tenant_id', 'scope']).unique().execute();

  await db.schema.createTable('api_key').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('key_hash', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('revoked', 'integer', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('api_key_hash').ifNotExists().on('api_key').columns(['key_hash']).unique().execute();

  await db.schema.createTable('config_audit').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('entity_type', 'text', (c) => c.notNull())
    .addColumn('entity_id', 'text', (c) => c.notNull())
    .addColumn('action', 'text', (c) => c.notNull())
    .addColumn('actor', 'text', (c) => c.notNull())
    .addColumn('before', 'text').addColumn('after', 'text')
    .addColumn('at', 'text', (c) => c.notNull())
    .execute();

  // ── lifecycle plane ──
  await db.schema.createTable('raw_artifact').ifNotExists()
    .addColumn('id', 'text', (c) => c.notNull())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('source', 'text', (c) => c.notNull())
    .addColumn('bytes', 'text', (c) => c.notNull())
    .addColumn('size', 'integer', (c) => c.notNull())
    .addColumn('received_at', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('raw_artifact_pkey', ['tenant_id', 'id']) // content-addressed, per tenant
    .execute();

  await db.schema.createTable('dedup_ledger').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('dedup_key', 'text', (c) => c.notNull())
    .addColumn('first_artifact_id', 'text', (c) => c.notNull())
    .addColumn('first_fingerprint', 'text', (c) => c.notNull())
    .addColumn('first_seen_at', 'text', (c) => c.notNull())
    .addColumn('occurrences', 'integer', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('dedup_ledger_key').ifNotExists().on('dedup_ledger').columns(['tenant_id', 'dedup_key']).unique().execute();

  await db.schema.createTable('interchange').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('relationship_id', 'text').addColumn('artifact_id', 'text', (c) => c.notNull())
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('dedup_key', 'text', (c) => c.notNull())
    .addColumn('isa13', 'text', (c) => c.notNull())
    .addColumn('sender_id', 'text', (c) => c.notNull())
    .addColumn('receiver_id', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('occurrence', 'integer', (c) => c.notNull())
    .addColumn('conflict', 'integer', (c) => c.notNull())
    .addColumn('received_at', 'text', (c) => c.notNull())
    .execute();

  // Shared supertype — common fields + lifecycle only.
  await db.schema.createTable('transaction').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('relationship_id', 'text').addColumn('interchange_id', 'text')
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('doc_type', 'text', (c) => c.notNull())
    .addColumn('transaction_control_number', 'text', (c) => c.notNull())
    .addColumn('functional_group_control_number', 'text', (c) => c.notNull())
    .addColumn('po_number', 'text')
    .addColumn('line_count', 'integer', (c) => c.notNull())
    .addColumn('current_state', 'text', (c) => c.notNull())
    .addColumn('conformant', 'integer', (c) => c.notNull())
    .addColumn('reason', 'text')
    .addColumn('received_at', 'text', (c) => c.notNull())
    .addColumn('validated_at', 'text').addColumn('delivered_at', 'text').addColumn('acknowledged_at', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('transaction_state').ifNotExists().on('transaction').columns(['tenant_id', 'current_state']).execute();
  await db.schema.createIndex('transaction_ponum').ifNotExists().on('transaction').columns(['tenant_id', 'doc_type', 'po_number']).execute();

  // Per-doc-type HEADER subtypes (1:1 with transaction; only that type's fields).
  await db.schema.createTable('transaction_850').ifNotExists()
    .addColumn('transaction_id', 'text', (c) => c.primaryKey().references('transaction.id').onDelete('cascade'))
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('purpose_code', 'text').addColumn('po_type', 'text').addColumn('po_date', 'text').addColumn('requested_ship_date', 'text')
    .execute();
  await db.schema.createTable('transaction_810').ifNotExists()
    .addColumn('transaction_id', 'text', (c) => c.primaryKey().references('transaction.id').onDelete('cascade'))
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('invoice_number', 'text', (c) => c.notNull())
    .addColumn('invoice_date', 'text').addColumn('total_amount', 'text').addColumn('tax_amount', 'text').addColumn('terms', 'text')
    .execute();
  await db.schema.createTable('transaction_855').ifNotExists()
    .addColumn('transaction_id', 'text', (c) => c.primaryKey().references('transaction.id').onDelete('cascade'))
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('purpose_code', 'text').addColumn('ack_type', 'text').addColumn('ack_date', 'text')
    .execute();
  await db.schema.createTable('transaction_856').ifNotExists()
    .addColumn('transaction_id', 'text', (c) => c.primaryKey().references('transaction.id').onDelete('cascade'))
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('shipment_id', 'text').addColumn('purpose', 'text').addColumn('ship_date', 'text')
    .addColumn('carrier_scac', 'text').addColumn('tracking_number', 'text')
    .addColumn('gross_weight', 'text').addColumn('weight_uom', 'text').addColumn('package_count', 'integer')
    .execute();

  // Generic line items.
  await db.schema.createTable('transaction_line').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('transaction_id', 'text', (c) => c.notNull().references('transaction.id').onDelete('cascade'))
    .addColumn('line_number', 'integer')
    .addColumn('sku', 'text').addColumn('sku_qualifier', 'text')
    .addColumn('quantity', 'text').addColumn('uom', 'text').addColumn('unit_price', 'text').addColumn('amount', 'text')
    .addColumn('description', 'text')
    .execute();
  await db.schema.createIndex('transaction_line_txn').ifNotExists().on('transaction_line').columns(['transaction_id']).execute();
  await db.schema.createIndex('transaction_line_sku').ifNotExists().on('transaction_line').columns(['tenant_id', 'sku']).execute();

  // A line's product identifiers (UP/VN/BP…) — 1:N.
  await db.schema.createTable('transaction_line_identifier').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('line_id', 'text', (c) => c.notNull().references('transaction_line.id').onDelete('cascade'))
    .addColumn('qualifier', 'text', (c) => c.notNull())
    .addColumn('value', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('transaction_line_identifier_line').ifNotExists().on('transaction_line_identifier').columns(['line_id']).execute();
  await db.schema.createIndex('transaction_line_identifier_val').ifNotExists().on('transaction_line_identifier').columns(['tenant_id', 'qualifier', 'value']).execute();

  // Per-doc-type LINE subtypes (1:1 with transaction_line).
  await db.schema.createTable('transaction_line_856').ifNotExists()
    .addColumn('line_id', 'text', (c) => c.primaryKey().references('transaction_line.id').onDelete('cascade'))
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('shipped_quantity', 'text').addColumn('ordered_quantity', 'text').addColumn('uom', 'text').addColumn('carton_id', 'text')
    .execute();
  await db.schema.createTable('transaction_line_855').ifNotExists()
    .addColumn('line_id', 'text', (c) => c.primaryKey().references('transaction_line.id').onDelete('cascade'))
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('ack_status', 'text').addColumn('ack_quantity', 'text').addColumn('reason', 'text')
    .execute();

  await db.schema.createTable('transaction_party').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('transaction_id', 'text', (c) => c.notNull().references('transaction.id').onDelete('cascade'))
    .addColumn('role', 'text', (c) => c.notNull())
    .addColumn('name', 'text').addColumn('id_code', 'text').addColumn('id_qualifier', 'text')
    .addColumn('address1', 'text').addColumn('address2', 'text').addColumn('city', 'text')
    .addColumn('region', 'text').addColumn('postal', 'text').addColumn('country', 'text')
    .execute();
  await db.schema.createIndex('transaction_party_txn').ifNotExists().on('transaction_party').columns(['transaction_id']).execute();

  await db.schema.createTable('transaction_reference').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('transaction_id', 'text', (c) => c.notNull().references('transaction.id').onDelete('cascade'))
    .addColumn('qualifier', 'text', (c) => c.notNull())
    .addColumn('value', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('transaction_reference_txn').ifNotExists().on('transaction_reference').columns(['transaction_id']).execute();

  await db.schema.createTable('transaction_date').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('transaction_id', 'text', (c) => c.notNull().references('transaction.id').onDelete('cascade'))
    .addColumn('qualifier', 'text', (c) => c.notNull())
    .addColumn('value', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('transaction_date_txn').ifNotExists().on('transaction_date').columns(['transaction_id']).execute();

  await db.schema.createTable('transaction_event').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('transaction_id', 'text', (c) => c.notNull())
    .addColumn('state', 'text', (c) => c.notNull())
    .addColumn('detail', 'text').addColumn('at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('processing_event').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('relationship_id', 'text', (c) => c.notNull())
    .addColumn('transaction_id', 'text').addColumn('interchange_id', 'text')
    .addColumn('outcome', 'text', (c) => c.notNull())
    .addColumn('source', 'text', (c) => c.notNull())
    .addColumn('received_at', 'text', (c) => c.notNull())
    .addColumn('artifact_id', 'text', (c) => c.notNull())
    .addColumn('dedup_key', 'text', (c) => c.notNull())
    .addColumn('occurrence', 'integer', (c) => c.notNull())
    .addColumn('doc_type', 'text').addColumn('functional_group_control_number', 'text').addColumn('transaction_control_number', 'text')
    .addColumn('first_artifact_id', 'text').addColumn('first_seen_at', 'text')
    .addColumn('valid', 'integer').addColumn('error_count', 'integer')
    .addColumn('delivered', 'integer', (c) => c.notNull())
    .addColumn('ack_control_number', 'text')
    .addColumn('needs_review', 'integer', (c) => c.notNull())
    .addColumn('note', 'text')
    .addColumn('resolution', 'text').addColumn('resolved_at', 'text').addColumn('resolved_by', 'text')
    .addColumn('resolution_note', 'text').addColumn('resolution_event_id', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('processing_event_review').ifNotExists().on('processing_event').columns(['tenant_id', 'needs_review']).execute();
  await db.schema.createIndex('processing_event_dedup').ifNotExists().on('processing_event').columns(['tenant_id', 'dedup_key']).execute();

  await db.schema.createTable('conformance_issue').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('transaction_id', 'text', (c) => c.notNull())
    .addColumn('level', 'text', (c) => c.notNull())
    .addColumn('segment_tag', 'text', (c) => c.notNull())
    .addColumn('segment_position', 'integer', (c) => c.notNull())
    .addColumn('element_position', 'integer')
    .addColumn('error_code', 'text', (c) => c.notNull())
    .addColumn('bad_value', 'text').addColumn('message', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('acknowledgment').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('relationship_id', 'text', (c) => c.notNull())
    .addColumn('interchange_id', 'text').addColumn('ack_type', 'text', (c) => c.notNull())
    .addColumn('control_number', 'text', (c) => c.notNull())
    .addColumn('group_control_number', 'text', (c) => c.notNull())
    .addColumn('edi', 'text', (c) => c.notNull())
    .addColumn('ak9', 'text')
    .addColumn('dispatched', 'integer', (c) => c.notNull())
    .addColumn('dispatched_at', 'text').addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('delivery').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('transaction_id', 'text', (c) => c.notNull())
    .addColumn('connector_instance_id', 'text')
    .addColumn('format', 'text', (c) => c.notNull())
    .addColumn('payload', 'text', (c) => c.notNull())
    .addColumn('delivered_at', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .execute();

  await db.schema.createTable('dispatch_queue').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('ack_id', 'text').addColumn('transaction_id', 'text').addColumn('transport_instance_id', 'text')
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('attempts', 'integer', (c) => c.notNull())
    .addColumn('next_attempt_at', 'text').addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  // ── certification plane ──
  await db.schema.createTable('certification_session').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('relationship_id', 'text', (c) => c.notNull())
    .addColumn('format_authority', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('spec_version', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('certified_at', 'text').addColumn('certified_by', 'text')
    .execute();
  await db.schema.createIndex('certification_session_rel').ifNotExists().on('certification_session').columns(['tenant_id', 'relationship_id']).execute();

  await db.schema.createTable('certification_doc').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('session_id', 'text', (c) => c.notNull())
    .addColumn('doc_type', 'text', (c) => c.notNull())
    .addColumn('role', 'text', (c) => c.notNull())
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('produced_by', 'text', (c) => c.notNull())
    .addColumn('validated_by', 'text', (c) => c.notNull())
    .addColumn('reference_artifact_id', 'text')
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('blocking', 'integer', (c) => c.notNull())
    .addColumn('attempt_count', 'integer', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('certification_doc_session').ifNotExists().on('certification_doc').columns(['session_id']).execute();

  await db.schema.createTable('certification_test_file').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('cert_doc_id', 'text', (c) => c.notNull())
    .addColumn('raw_artifact_id', 'text', (c) => c.notNull())
    .addColumn('uploaded_by', 'text', (c) => c.notNull())
    .addColumn('attempt_no', 'integer', (c) => c.notNull())
    .addColumn('verdict', 'text', (c) => c.notNull())
    .addColumn('correlated', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('certification_test_file_doc').ifNotExists().on('certification_test_file').columns(['cert_doc_id']).execute();

  await db.schema.createTable('certification_issue').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('test_file_id', 'text', (c) => c.notNull())
    .addColumn('segment', 'text').addColumn('element', 'text')
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('severity', 'text', (c) => c.notNull())
    .addColumn('code', 'text')
    .addColumn('message', 'text', (c) => c.notNull())
    .addColumn('ai_suggestion', 'text')
    .addColumn('directed_to', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('certification_issue_file').ifNotExists().on('certification_issue').columns(['test_file_id']).execute();

  await db.schema.createTable('certification_message').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('session_id', 'text', (c) => c.notNull())
    .addColumn('cert_doc_id', 'text').addColumn('related_issue_id', 'text')
    .addColumn('author_role', 'text', (c) => c.notNull())
    .addColumn('author_user_id', 'text')
    .addColumn('body', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('delivered_at', 'text')
    .execute();
  await db.schema.createIndex('certification_message_session').ifNotExists().on('certification_message').columns(['session_id']).execute();

  await db.schema.createTable('certification_event').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('session_id', 'text', (c) => c.notNull())
    .addColumn('actor', 'text', (c) => c.notNull())
    .addColumn('verb', 'text', (c) => c.notNull())
    .addColumn('doc_type', 'text').addColumn('detail', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('seq', 'integer', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('certification_event_session').ifNotExists().on('certification_event').columns(['session_id', 'seq']).execute();

  // ── identity plane (RBAC) ──
  await db.schema.createTable('console_user').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('email', 'text', (c) => c.notNull())
    .addColumn('role', 'text', (c) => c.notNull())
    .addColumn('password_hash', 'text', (c) => c.notNull())
    .addColumn('password_salt', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('revoked', 'integer', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('console_user_email').ifNotExists().on('console_user').columns(['email']).unique().execute();

  await db.schema.createTable('user_relationship_scope').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('user_id', 'text', (c) => c.notNull())
    .addColumn('relationship_id', 'text', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('user_relationship_scope_user').ifNotExists().on('user_relationship_scope').columns(['user_id']).execute();

  await db.schema.createTable('user_session').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('user_id', 'text', (c) => c.notNull())
    .addColumn('token_hash', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('revoked', 'integer', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('user_session_token').ifNotExists().on('user_session').columns(['token_hash']).unique().execute();

  // ── dropship plane ──
  await db.schema.createTable('product_catalog').ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('tenant_id', 'text', (c) => c.notNull())
    .addColumn('sellable_sku', 'text', (c) => c.notNull())
    .addColumn('relationship_id', 'text', (c) => c.notNull())
    .addColumn('vendor_sku', 'text', (c) => c.notNull())
    .addColumn('pack_size', 'text').addColumn('uom', 'text').addColumn('priority', 'integer')
    .addColumn('active', 'integer', (c) => c.notNull())
    .execute();
  await db.schema.createIndex('product_catalog_sku').ifNotExists().on('product_catalog').columns(['tenant_id', 'sellable_sku']).execute();
  await db.schema.createIndex('product_catalog_binding').ifNotExists().on('product_catalog').columns(['tenant_id', 'sellable_sku', 'relationship_id']).unique().execute();
}

/** Every table name, for verification/introspection. */
export const ALL_TABLES = [
  'tenant', 'trading_partner', 'trading_relationship', 'relationship_document', 'connector_instance',
  'connector_map', 'partner_map', 'doc_spec', 'transport_instance', 'control_number_seq', 'api_key', 'config_audit',
  'raw_artifact', 'dedup_ledger', 'interchange',
  'transaction', 'transaction_850', 'transaction_810', 'transaction_855', 'transaction_856',
  'transaction_line', 'transaction_line_identifier', 'transaction_line_855', 'transaction_line_856',
  'transaction_party', 'transaction_reference', 'transaction_date', 'transaction_event',
  'processing_event', 'conformance_issue', 'acknowledgment', 'delivery', 'dispatch_queue',
  'certification_session', 'certification_doc', 'certification_test_file', 'certification_issue',
  'certification_message', 'certification_event',
  'console_user', 'user_relationship_scope', 'user_session',
  'product_catalog',
] as const;
