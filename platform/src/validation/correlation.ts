import Decimal from 'decimal.js';

/**
 * Cross-document correlation — beyond per-document conformance, a returned response document must
 * actually CORRESPOND to the document it answers. A partner's 855/856/810 can be perfectly well-formed
 * yet reference the wrong PO, a line we never ordered, or a total that doesn't add up; conformance alone
 * won't catch that. This is the second half of "we check their response files" on the certification board.
 *
 * Pure and canonical-only (no X12). All entry points share one line-level correlation core.
 */

export interface CorrelationIssue {
  kind: 'po-mismatch' | 'unknown-line' | 'qty-exceeds' | 'total-mismatch' | 'control-mismatch';
  message: string;
  /** The offending reference (PO number, product id, total, control number) — anchors the finding. */
  ref?: string;
}

export interface CorrelationResult {
  correlated: boolean;
  issues: CorrelationIssue[];
}

interface Line {
  ids?: Array<{ value?: string }>;
  quantity?: { value?: number };
  unitPrice?: { amount?: number };
  lineNumber?: string;
}
interface Order {
  poNumber?: string;
  lineItems?: Line[];
}

/** First product/service id on a line (the SKU/UPC we key correspondence on). */
const productId = (line: Line): string | undefined => line.ids?.[0]?.value;

/** Sum quantities by product id (both sides are aggregated before comparison). */
function byProduct(lines: Line[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const line of lines) {
    const pid = productId(line);
    if (pid !== undefined) m.set(pid, (m.get(pid) ?? 0) + (line.quantity?.value ?? 0));
  }
  return m;
}

/**
 * Line-level correspondence, shared by every response type: each response line must reference a
 * product on the order, and no product may be over-committed (acknowledged/shipped/invoiced beyond
 * what was ordered). Both sides are aggregated by product so split lines can't slip a total through.
 */
function correlateLines(respLines: Line[], order: Order): CorrelationIssue[] {
  const issues: CorrelationIssue[] = [];
  const ordered = byProduct(order.lineItems ?? []);
  const responded = byProduct(respLines);
  for (const [pid, qty] of responded) {
    if (!ordered.has(pid)) { issues.push({ kind: 'unknown-line', ref: pid, message: `references product ${pid}, not present on PO ${order.poNumber}` }); continue; }
    const ordQty = ordered.get(pid) ?? 0;
    if (qty > ordQty) issues.push({ kind: 'qty-exceeds', ref: pid, message: `commits ${qty} of ${pid}, exceeding the ${ordQty} ordered` });
  }
  return issues;
}

const poMismatch = (respPo: string | undefined, order: Order): CorrelationIssue => ({
  kind: 'po-mismatch', ref: respPo,
  message: `references PO ${respPo ?? '(none)'} but this order is PO ${order.poNumber ?? '(none)'}`,
});

/** 855 → 850: PO must match, and lines must correspond. */
export function correlateAckToOrder(ack: Order, order: Order): CorrelationResult {
  if ((ack.poNumber ?? '') !== (order.poNumber ?? '')) return { correlated: false, issues: [poMismatch(ack.poNumber, order)] };
  const issues = correlateLines(ack.lineItems ?? [], order);
  return { correlated: issues.length === 0, issues };
}

interface Ship { orders?: Array<{ poNumber?: string; items?: Line[] }>; }

/** 856 → 850: the shipment must carry the order's PO, and shipped lines must correspond. */
export function correlateShipToOrder(ship: Ship, order: Order): CorrelationResult {
  const shipped = (ship.orders ?? []).find((o) => (o.poNumber ?? '') === (order.poNumber ?? ''));
  if (!shipped) return { correlated: false, issues: [poMismatch((ship.orders ?? [])[0]?.poNumber, order)] };
  const issues = correlateLines(shipped.items ?? [], order);
  return { correlated: issues.length === 0, issues };
}

interface Invoice extends Order { totalAmount?: number; }

/** 810 → 850: PO + lines correspond, AND the invoice total reconciles to its own line extensions. */
export function correlateInvoiceToOrder(invoice: Invoice, order: Order): CorrelationResult {
  if ((invoice.poNumber ?? '') !== (order.poNumber ?? '')) return { correlated: false, issues: [poMismatch(invoice.poNumber, order)] };
  const issues = correlateLines(invoice.lineItems ?? [], order);
  if (invoice.totalAmount !== undefined) {
    // Decimal math (never float) — sum(qty × unitPrice) must equal the stated invoice total.
    const computed = (invoice.lineItems ?? []).reduce(
      (acc, l) => acc.plus(new Decimal(l.quantity?.value ?? 0).times(l.unitPrice?.amount ?? 0)),
      new Decimal(0),
    );
    if (!computed.equals(new Decimal(invoice.totalAmount))) {
      issues.push({ kind: 'total-mismatch', ref: String(invoice.totalAmount), message: `invoice total ${invoice.totalAmount} does not equal the line sum ${computed.toString()}` });
    }
  }
  return { correlated: issues.length === 0, issues };
}

/**
 * Dispatch correlation by response doc type against the originating order (850). Returns undefined for
 * doc types that don't correlate to an order (846 standalone; 997 correlates to a group, not an order).
 */
export function correlateToOrder(docType: string, response: unknown, order: Order): CorrelationResult | undefined {
  switch (docType) {
    case '855': return correlateAckToOrder(response as Order, order);
    case '856': return correlateShipToOrder(response as Ship, order);
    case '810': return correlateInvoiceToOrder(response as Invoice, order);
    default: return undefined;
  }
}

interface Sent997 { groupControlNumber: string; functionalId?: string; }
interface Ack997Shape { ackGroupControlNumber?: string; ackFunctionalId?: string; ackCode?: string; }

/** 997 → the group WE sent: the ack must reference our GS control number (and functional id). */
export function correlate997ToGroup(ack: Ack997Shape, sent: Sent997): CorrelationResult {
  const issues: CorrelationIssue[] = [];
  if ((ack.ackGroupControlNumber ?? '') !== sent.groupControlNumber) {
    issues.push({ kind: 'control-mismatch', ref: ack.ackGroupControlNumber, message: `997 acks group control ${ack.ackGroupControlNumber ?? '(none)'} but we sent ${sent.groupControlNumber}` });
  }
  if (sent.functionalId !== undefined && (ack.ackFunctionalId ?? '') !== sent.functionalId) {
    issues.push({ kind: 'control-mismatch', ref: ack.ackFunctionalId, message: `997 acks functional group ${ack.ackFunctionalId ?? '(none)'} but we sent ${sent.functionalId}` });
  }
  return { correlated: issues.length === 0, issues };
}
