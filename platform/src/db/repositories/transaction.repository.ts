import { randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import { CanonicalDocument } from '../../canonical/types/document.types';
import { LineItem, Party, TypedValue } from '../../canonical/types/common.types';
import { TransactionStore, SaveTransaction, StoredTransaction, TransactionSummary } from '../../intake/transaction-store';

const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
const num = (v: string | null): number | undefined => (v == null ? undefined : Number(v));

/**
 * Persists a processed transaction as NORMALIZED rows (class-table inheritance): the shared
 * `transaction` header + the per-doc-type subtype + line rows (+ product identifiers, line subtypes)
 * + parties/references/dates — no JSON blob on the query path. `reconstruct`/`get` rebuild the
 * canonical document from those rows for re-emit. Amounts/quantities are stored as exact decimal text.
 */
export class TransactionRepository extends TransactionStore {
  constructor(private readonly db: Kysely<DB>) { super(); }

  async save(p: SaveTransaction): Promise<string> {
    const id = randomUUID();
    const d = p.doc as Record<string, any>;
    const lines: LineItem[] = p.docType === '856'
      ? (d.orders ?? []).flatMap((o: any) => o.items ?? [])
      : (d.lineItems ?? []);
    const ts = new Date().toISOString();

    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('transaction').values({
        id, tenant_id: p.tenantId, relationship_id: p.relationshipId ?? null, interchange_id: p.interchangeId ?? null,
        direction: p.direction, doc_type: p.docType,
        transaction_control_number: p.transactionControlNumber, functional_group_control_number: p.functionalGroupControlNumber,
        po_number: d.poNumber ?? d.orders?.[0]?.poNumber ?? null,
        line_count: lines.length, current_state: p.currentState, conformant: p.conformant ? 1 : 0, reason: p.reason ?? null,
        received_at: p.receivedAt, validated_at: p.validatedAt ?? null, delivered_at: p.deliveredAt ?? null,
        acknowledged_at: p.acknowledgedAt ?? null, created_at: ts, updated_at: ts,
      }).execute();

      await this.saveSubtype(trx, id, p.tenantId, p.docType, d);

      let n = 0;
      for (const li of lines) {
        const lineId = randomUUID();
        n += 1;
        await trx.insertInto('transaction_line').values({
          id: lineId, tenant_id: p.tenantId, transaction_id: id, line_number: li.lineNumber ? Number(li.lineNumber) : n,
          sku: li.ids?.[0]?.value ?? null, sku_qualifier: li.ids?.[0]?.type ?? null,
          quantity: str(li.quantity?.value), uom: li.quantity?.uom ?? null,
          unit_price: str(li.unitPrice?.amount), amount: str(li.charges?.[0]?.amount?.amount), description: li.description ?? null,
        }).execute();

        for (const pid of li.ids ?? []) {
          if (!pid.type) continue; // unqualified id → already captured by the promoted `sku` column
          await trx.insertInto('transaction_line_identifier').values({ id: randomUUID(), tenant_id: p.tenantId, line_id: lineId, qualifier: pid.type, value: pid.value }).execute();
        }
        if (p.docType === '855' && (li as any).ackStatus !== undefined) {
          await trx.insertInto('transaction_line_855').values({ line_id: lineId, tenant_id: p.tenantId, ack_status: (li as any).ackStatus ?? null, ack_quantity: str(li.quantity?.value), reason: null }).execute();
        }
        if (p.docType === '856') {
          await trx.insertInto('transaction_line_856').values({ line_id: lineId, tenant_id: p.tenantId, shipped_quantity: str(li.quantity?.value), ordered_quantity: null, uom: li.quantity?.uom ?? null, carton_id: null }).execute();
        }
      }

      for (const party of (d.parties ?? []) as Party[]) {
        await trx.insertInto('transaction_party').values({
          id: randomUUID(), tenant_id: p.tenantId, transaction_id: id, role: party.role,
          name: party.address?.name ?? null, id_code: party.ids?.[0]?.value ?? null, id_qualifier: party.ids?.[0]?.type ?? null,
          address1: party.address?.line1 ?? null, address2: party.address?.line2 ?? null, city: party.address?.city ?? null,
          region: party.address?.state ?? null, postal: party.address?.postalCode ?? null, country: party.address?.country ?? null,
        }).execute();
      }
      for (const ref of (d.references ?? []) as TypedValue[]) {
        if (!ref.type) continue;
        await trx.insertInto('transaction_reference').values({ id: randomUUID(), tenant_id: p.tenantId, transaction_id: id, qualifier: ref.type, value: ref.value }).execute();
      }
      for (const dt of (d.dates ?? []) as TypedValue[]) {
        if (!dt.type) continue;
        await trx.insertInto('transaction_date').values({ id: randomUUID(), tenant_id: p.tenantId, transaction_id: id, qualifier: dt.type, value: dt.value }).execute();
      }
    });
    return id;
  }

  private async saveSubtype(trx: Kysely<DB>, id: string, tenantId: string, docType: string, d: Record<string, any>): Promise<void> {
    if (docType === '850') {
      await trx.insertInto('transaction_850').values({ transaction_id: id, tenant_id: tenantId, purpose_code: d.extensions?.purposeCode ?? null, po_type: d.extensions?.poType ?? null, po_date: d.poDate ?? null, requested_ship_date: null }).execute();
    } else if (docType === '810') {
      await trx.insertInto('transaction_810').values({ transaction_id: id, tenant_id: tenantId, invoice_number: d.invoiceNumber ?? '', invoice_date: d.invoiceDate ?? null, total_amount: str(d.totalAmount), tax_amount: null, terms: null }).execute();
    } else if (docType === '855') {
      await trx.insertInto('transaction_855').values({ transaction_id: id, tenant_id: tenantId, purpose_code: null, ack_type: d.ackType ?? null, ack_date: d.ackDate ?? null }).execute();
    } else if (docType === '856') {
      await trx.insertInto('transaction_856').values({ transaction_id: id, tenant_id: tenantId, shipment_id: d.shipmentId ?? null, purpose: null, ship_date: d.shipDate ?? null, carrier_scac: null, tracking_number: null, gross_weight: null, weight_uom: null, package_count: null }).execute();
    }
  }

  async get(tenantId: string, id: string): Promise<StoredTransaction | undefined> {
    const h = await this.db.selectFrom('transaction').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!h) return undefined;
    const canonical = await this.reconstruct(tenantId, h);
    return {
      id: h.id, tenantId: h.tenant_id, docType: h.doc_type, direction: h.direction, poNumber: h.po_number ?? undefined,
      currentState: h.current_state, conformant: h.conformant === 1,
      transactionControlNumber: h.transaction_control_number, functionalGroupControlNumber: h.functional_group_control_number,
      canonical,
    };
  }

  /** Dashboard/ops query — header summaries by tenant, optionally filtered by doc type / state. */
  async list(tenantId: string, filter: { docType?: string; state?: string } = {}): Promise<Array<{ id: string; docType: string; poNumber?: string; currentState: string; conformant: boolean }>> {
    let q = this.db.selectFrom('transaction').select(['id', 'doc_type', 'po_number', 'current_state', 'conformant']).where('tenant_id', '=', tenantId);
    if (filter.docType) q = q.where('doc_type', '=', filter.docType);
    if (filter.state) q = q.where('current_state', '=', filter.state);
    return (await q.orderBy('created_at').execute()).map((r) => ({ id: r.id, docType: r.doc_type, poNumber: r.po_number ?? undefined, currentState: r.current_state, conformant: r.conformant === 1 }));
  }

  private async reconstruct(tenantId: string, h: { id: string; doc_type: string; direction: string; po_number: string | null }): Promise<CanonicalDocument> {
    const lineRows = await this.db.selectFrom('transaction_line').selectAll().where('transaction_id', '=', h.id).orderBy('line_number').execute();
    const lineItems: LineItem[] = [];
    for (const lr of lineRows) {
      const idRows = await this.db.selectFrom('transaction_line_identifier').select(['qualifier', 'value']).where('line_id', '=', lr.id).execute();
      const ids: TypedValue[] = idRows.map((i) => ({ type: i.qualifier, value: i.value }));
      const li: LineItem = {
        lineNumber: lr.line_number != null ? String(lr.line_number) : undefined,
        ids: ids.length ? ids : (lr.sku ? [{ type: lr.sku_qualifier ?? '', value: lr.sku }] : undefined),
        description: lr.description ?? undefined,
        quantity: lr.quantity != null ? { value: Number(lr.quantity), uom: lr.uom ?? undefined } : undefined,
        unitPrice: lr.unit_price != null ? { amount: Number(lr.unit_price) } : undefined,
      };
      if (h.doc_type === '855') {
        const a = await this.db.selectFrom('transaction_line_855').select('ack_status').where('line_id', '=', lr.id).executeTakeFirst();
        if (a) (li as any).ackStatus = a.ack_status ?? undefined;
      }
      lineItems.push(li);
    }

    const partyRows = await this.db.selectFrom('transaction_party').selectAll().where('transaction_id', '=', h.id).execute();
    const parties: Party[] = partyRows.map((pr) => ({
      role: pr.role,
      ids: pr.id_code ? [{ type: pr.id_qualifier ?? '', value: pr.id_code }] : undefined,
      address: { name: pr.name ?? undefined, line1: pr.address1 ?? undefined, line2: pr.address2 ?? undefined, city: pr.city ?? undefined, state: pr.region ?? undefined, postalCode: pr.postal ?? undefined, country: pr.country ?? undefined },
    }));
    const references = (await this.db.selectFrom('transaction_reference').select(['qualifier', 'value']).where('transaction_id', '=', h.id).execute()).map((r) => ({ type: r.qualifier, value: r.value }));
    const dates = (await this.db.selectFrom('transaction_date').select(['qualifier', 'value']).where('transaction_id', '=', h.id).execute()).map((r) => ({ type: r.qualifier, value: r.value }));

    const meta = { docType: h.doc_type as any, direction: h.direction as any, partner: '', tenantId };
    const base: any = { meta };
    if (parties.length) base.parties = parties;
    if (references.length) base.references = references;
    if (dates.length) base.dates = dates;

    if (h.doc_type === '810') {
      const s = await this.db.selectFrom('transaction_810').selectAll().where('transaction_id', '=', h.id).executeTakeFirst();
      return { ...base, invoiceNumber: s?.invoice_number ?? '', invoiceDate: s?.invoice_date ?? undefined, poNumber: h.po_number ?? undefined, totalAmount: num(s?.total_amount ?? null), lineItems } as CanonicalDocument;
    }
    if (h.doc_type === '855') {
      const s = await this.db.selectFrom('transaction_855').selectAll().where('transaction_id', '=', h.id).executeTakeFirst();
      return { ...base, poNumber: h.po_number ?? '', ackType: s?.ack_type ?? undefined, ackDate: s?.ack_date ?? undefined, lineItems } as CanonicalDocument;
    }
    if (h.doc_type === '856') {
      const s = await this.db.selectFrom('transaction_856').selectAll().where('transaction_id', '=', h.id).executeTakeFirst();
      return { ...base, shipmentId: s?.shipment_id ?? '', shipDate: s?.ship_date ?? undefined, orders: [{ poNumber: h.po_number ?? undefined, items: lineItems }] } as CanonicalDocument;
    }
    // 850 (default)
    const s = await this.db.selectFrom('transaction_850').selectAll().where('transaction_id', '=', h.id).executeTakeFirst();
    return { ...base, poNumber: h.po_number ?? '', poDate: s?.po_date ?? undefined, lineItems } as CanonicalDocument;
  }
}
