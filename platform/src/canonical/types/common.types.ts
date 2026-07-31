/**
 * Shared canonical sub-components — version- and partner-AGNOSTIC business facts.
 *
 * Design rules (from docs/context.md "Core Invariant" + canonical/README):
 *  - Typed arrays ({type,value}) absorb qualifier-coded variation with ZERO schema change.
 *  - `extensions` absorbs true one-offs. What recurs there graduates to a first-class field.
 *  - A field earns a place here only if it's business-meaningful ACROSS partners — never to
 *    satisfy one vendor (that belongs in the vendor's map).
 */

/** Qualifier-coded value: absorbs REF/DTM/N9/etc. variation without touching the schema. */
export interface TypedValue {
  /** The qualifier/type code's canonical meaning (e.g. 'vendorOrderNumber', 'shipDate'). */
  type: string;
  value: string;
}

/** Escape hatch for genuine one-offs. Watch what accumulates — it's the graduation backlog. */
export type Extensions = Record<string, unknown>;

export interface Address {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** A trading party (buyer, seller, ship-to, bill-to, …) with its coded identifiers. */
export interface Party {
  /** Canonical role, e.g. 'shipTo', 'billTo', 'buyingParty', 'vendor'. */
  role: string;
  address?: Address;
  /** Coded identities: GLN/DUNS, buyer/vendor codes, etc. */
  ids?: TypedValue[];
  extensions?: Extensions;
}

export interface Reference {
  references?: TypedValue[];
}

export interface Money {
  amount: number;
  currency?: string;
}

export interface Charge {
  /** Allowance/charge indicator or type. */
  type: string;
  amount: Money;
  description?: string;
  extensions?: Extensions;
}

export interface Quantity {
  value: number;
  /** Unit of measure (canonical); code cross-reference normalizes partner UOMs elsewhere. */
  uom?: string;
}

export interface LineItem {
  lineNumber?: string;
  /** Product identifiers: UPC/GTIN, buyer part #, vendor part #, … */
  ids?: TypedValue[];
  description?: string;
  quantity?: Quantity;
  unitPrice?: Money;
  references?: TypedValue[];
  dates?: TypedValue[];
  charges?: Charge[];
  extensions?: Extensions;
}
