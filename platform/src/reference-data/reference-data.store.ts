import { Injectable } from '@nestjs/common';

/**
 * Reference-data subsystem — the tables that transforms/lookups draw on. Two kinds:
 *   - cross-reference: source code → canonical code (e.g. UOM "CS" → "CA", SCAC, ship-method).
 *   - enrichment/master data: key → attributes (e.g. SKU → {packSize} for cases→eaches).
 * In-memory now; DB-backed in the product. Central & reusable across maps (NOT inline per map) —
 * both the customer-edge object-mapper and (later) the partner-edge engine draw on this.
 *
 * Lookups THROW on a missing entry — never silently pass an unmapped code/key (financial safety).
 */
@Injectable()
export class ReferenceDataStore {
  private readonly crossRefs = new Map<string, Map<string, string>>();
  private readonly enrichments = new Map<string, Map<string, Record<string, unknown>>>();

  setCrossRef(table: string, entries: Record<string, string>): void {
    this.crossRefs.set(table, new Map(Object.entries(entries)));
  }

  crossref(table: string, value: string): string {
    const t = this.crossRefs.get(table);
    if (!t) throw new Error(`cross-ref table not found: "${table}"`);
    const mapped = t.get(value);
    if (mapped === undefined) throw new Error(`no cross-ref for "${value}" in table "${table}"`);
    return mapped;
  }

  setEnrichment(table: string, entries: Record<string, Record<string, unknown>>): void {
    this.enrichments.set(table, new Map(Object.entries(entries)));
  }

  enrich(table: string, key: string): Record<string, unknown> {
    const t = this.enrichments.get(table);
    if (!t) throw new Error(`enrichment table not found: "${table}"`);
    const rec = t.get(key);
    if (!rec) throw new Error(`no enrichment for "${key}" in table "${table}"`);
    return rec;
  }
}
