import { DocType, Direction } from '../../mapping/dsl/map.types';
import { Charge, Extensions, LineItem, Party, TypedValue } from './common.types';

/**
 * Canonical documents — the version-agnostic hub. Both edges (partner EDI maps and customer
 * connectors) translate to/from these shapes. Onboarding a vendor = a new MAP, never a change
 * here. The schema changes only for a genuinely new business fact — once, centrally, additively.
 *
 * NOTE: these are the load-bearing top-level contracts; the full field sets get fleshed out in
 * Phase 1 M1 against the drafts in docs/schema/canonical/. Kept intentionally lean here.
 */

/** Control/source metadata carried on every canonical document. */
export interface CanonicalMeta {
  docType: DocType;
  direction: Direction;
  partner: string;
  /** Tenant that owns this document — multi-tenancy from day one. */
  tenantId: string;
}

/** Inbound-only: parse-result metadata (source control numbers, unmapped capture). */
export interface InboundMeta {
  interchangeControlNumber?: string;
  groupControlNumber?: string;
  transactionControlNumber?: string;
  /** Segments/elements the map didn't claim — captured, never dropped. */
  unmapped?: unknown[];
}

export interface CanonicalDocumentBase {
  meta: CanonicalMeta;
  inbound?: InboundMeta;
  extensions?: Extensions;
}

/** 850 — Purchase Order (direction-neutral; sell-side receives it, buy-side emits it). */
export interface Order850 extends CanonicalDocumentBase {
  poNumber: string;
  poDate?: string;
  parties?: Party[];
  references?: TypedValue[];
  dates?: TypedValue[];
  charges?: Charge[];
  lineItems: LineItem[];
}

/** 810 — Invoice (sell-side outbound). Different segments (BIG/IT1/TDS), same engine. */
export interface Invoice810 extends CanonicalDocumentBase {
  invoiceNumber: string;
  invoiceDate?: string;
  poNumber?: string;
  parties?: Party[];
  lineItems: LineItem[];
  totalAmount?: number;
}

/** 855 — Purchase Order Acknowledgment (sell-side outbound). Per-line ack status. */
export interface Ack855 extends CanonicalDocumentBase {
  poNumber: string;
  ackType?: string;
  ackDate?: string;
  parties?: Party[];
  lineItems: Array<LineItem & { ackStatus?: string }>;
}

/** 856 — Advance Ship Notice (sell-side outbound). HIERARCHICAL: shipment → orders → items. */
export interface Ship856 extends CanonicalDocumentBase {
  shipmentId: string;
  shipDate?: string;
  orders: Array<{ poNumber?: string; items: LineItem[] }>;
}

/** 997 — Functional Acknowledgment (both directions). Generated from receipt/validation. */
export interface Ack997 extends CanonicalDocumentBase {
  ackFunctionalId: string;
  ackGroupControlNumber: string;
  ackCode: string;
  setsIncluded: string;
  setsReceived: string;
  setsAccepted: string;
}

// 846 (inventory/price) follows the same flat pattern — a canonical shape + a map, no engine change.
export type CanonicalDocument =
  | Order850
  | Invoice810
  | Ack855
  | Ship856
  | Ack997
  | CanonicalDocumentBase;
