/**
 * Cross-document correlation — beyond per-document conformance, a returned response document must
 * actually CORRESPOND to the document it answers. A partner's 855 can be perfectly well-formed yet
 * acknowledge the wrong PO or a line we never ordered; conformance alone won't catch that. This is
 * the second half of "we check their response files" on the certification board.
 *
 * Pure and canonical-only (no X12): `(response, origin) → issues`. Direction-neutral by design;
 * `correlateAckToOrder` covers 855→850 (an ASN 856→850 and invoice 810→850 will follow the same shape).
 */

export interface CorrelationIssue {
  kind: 'po-mismatch' | 'unknown-line' | 'qty-exceeds';
  message: string;
  /** The offending reference (PO number or product id), for the console to anchor the finding. */
  ref?: string;
}

export interface CorrelationResult {
  correlated: boolean;
  issues: CorrelationIssue[];
}

interface Line {
  ids?: Array<{ value?: string }>;
  quantity?: { value?: number };
  lineNumber?: string;
}
interface Doc {
  poNumber?: string;
  lineItems?: Line[];
}

/** First product/service id on a line (the SKU/UPC we key correspondence on). */
const productId = (line: Line): string | undefined => line.ids?.[0]?.value;

/**
 * Validate that a canonical 855 acknowledgment corresponds to the canonical 850 it answers:
 *   - the acknowledged PO number matches the order's,
 *   - every acknowledged line references a product we actually ordered,
 *   - no acknowledged quantity exceeds what was ordered for that product.
 * A PO mismatch is definitive (nothing else can be trusted) and is reported alone.
 */
export function correlateAckToOrder(ack: Doc, order: Doc): CorrelationResult {
  const issues: CorrelationIssue[] = [];

  if ((ack.poNumber ?? '') !== (order.poNumber ?? '')) {
    issues.push({
      kind: 'po-mismatch',
      ref: ack.poNumber,
      message: `855 acknowledges PO ${ack.poNumber ?? '(none)'} but this order is PO ${order.poNumber ?? '(none)'}`,
    });
    return { correlated: false, issues }; // nothing downstream is meaningful once the PO is wrong
  }

  const ordered = new Map<string, number>();
  for (const line of order.lineItems ?? []) {
    const pid = productId(line);
    if (pid !== undefined) ordered.set(pid, (ordered.get(pid) ?? 0) + (line.quantity?.value ?? 0));
  }

  // Aggregate the ack side by product too, so a SKU split across several ACK lines is summed before
  // comparison — otherwise each partial line could pass while the total over-acknowledges the order.
  const acked = new Map<string, number>();
  for (const line of ack.lineItems ?? []) {
    const pid = productId(line);
    if (pid === undefined) continue; // a line with no id can't be correlated; conformance covers presence
    if (!ordered.has(pid)) {
      issues.push({ kind: 'unknown-line', ref: pid, message: `855 acknowledges product ${pid}, not present on PO ${order.poNumber}` });
      continue;
    }
    acked.set(pid, (acked.get(pid) ?? 0) + (line.quantity?.value ?? 0));
  }

  for (const [pid, ackQty] of acked) {
    const ordQty = ordered.get(pid) ?? 0;
    if (ackQty > ordQty) {
      issues.push({ kind: 'qty-exceeds', ref: pid, message: `855 acknowledges ${ackQty} of ${pid}, exceeding the ${ordQty} ordered` });
    }
  }

  return { correlated: issues.length === 0, issues };
}
