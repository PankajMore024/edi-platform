import { Injectable } from '@nestjs/common';
import { CanonicalDocument } from '../canonical/types/document.types';
import { resolvePath, setPath } from '../mapping/engine/path';
import { parseDecimal } from '../mapping/engine/coerce';
import { applyDecimal } from '../mapping/engine/format';
import { ReferenceDataStore } from '../reference-data/reference-data.store';
import { applyTransforms } from './transforms';
import { ConnectorFieldMap, ConnectorMap } from './connector.types';

/**
 * Object-mapper — the customer-edge codec: native object/record shape → canonical. Sibling of the
 * X12 map engine (partner edge); both target canonical. Reuses mapping/'s pure operators
 * (resolvePath/setPath/coerce) so the two codecs share one operator library.
 *
 * `native` is either an array of records (flat-file rows) or a single object (API payload). Header
 * fields read from the record/first-row; line fields build the canonical line array. Both directions
 * run transform chains: `transform` on ingest, `emitTransform` on emit (explicit, not auto-inverted).
 */
@Injectable()
export class ObjectMapper {
  // Default lets tests do `new ObjectMapper()`; Nest injects the shared store in the app.
  constructor(private readonly refData: ReferenceDataStore = new ReferenceDataStore()) {}

  ingest(native: unknown, map: ConnectorMap): CanonicalDocument {
    const headerSource = Array.isArray(native) ? (native[0] ?? {}) : native;
    const doc: any = {
      meta: { docType: map.docType, direction: map.direction, partner: '', tenantId: '' },
    };

    for (const f of map.header) {
      const v = this.resolveField(f, headerSource);
      if (v !== undefined) setPath(doc, f.to, v);
    }

    if (map.lineTo) {
      const records = map.lineOver
        ? resolvePath(native, map.lineOver)
        : Array.isArray(native)
          ? native
          : [];
      if (Array.isArray(records)) {
        doc[map.lineTo] = records.map((rec) => {
          const item: any = {};
          for (const f of map.lineFields ?? []) {
            const v = this.resolveField(f, rec);
            if (v !== undefined) setPath(item, f.to, v);
          }
          return item;
        });
      }
    }

    return doc as CanonicalDocument;
  }

  private resolveField(f: ConnectorFieldMap, source: unknown): string | number | undefined {
    let raw: unknown = f.const !== undefined ? f.const : f.from !== undefined ? resolvePath(source, f.from) : undefined;

    if (raw === undefined || raw === null || raw === '') {
      if (f.default !== undefined) raw = f.default;
      else return undefined;
    }

    if (f.transform) raw = applyTransforms(raw, f.transform, { record: source, refData: this.refData });
    if (f.decimal !== undefined) return parseDecimal(String(raw));
    return raw as string | number;
  }

  /**
   * Reverse: canonical → native. The same connector-map with roles reversed (read `to` from
   * canonical, write `from` to native). `lineOver` present → nested object; else flat rows
   * (header repeated per line). Only fields with a `from` are emitted (const-only fields are
   * ingest-only). `decimal` re-formats numbers to fixed strings (mirror of ingest coercion).
   */
  emit(canonical: unknown, map: ConnectorMap): unknown {
    if (map.lineOver) {
      const obj: any = {};
      for (const f of map.header) this.writeNested(obj, f, canonical);
      if (map.lineTo) {
        const items = (resolvePath(canonical, map.lineTo) as any[]) ?? [];
        setPath(obj, map.lineOver, items.map((item) => {
          const o: any = {};
          for (const f of map.lineFields ?? []) this.writeNested(o, f, item);
          return o;
        }));
      }
      return obj;
    }

    const header: Record<string, string> = {};
    for (const f of map.header) this.writeFlat(header, f, canonical);
    if (!map.lineTo) return [header];
    const items = (resolvePath(canonical, map.lineTo) as any[]) ?? [];
    return items.map((item) => {
      const row: Record<string, string> = { ...header };
      for (const f of map.lineFields ?? []) this.writeFlat(row, f, item);
      return row;
    });
  }

  private writeFlat(target: Record<string, string>, f: ConnectorFieldMap, source: unknown): void {
    if (f.from === undefined) return; // const-only fields are ingest-only
    const s = this.formatField(f, resolvePath(source, f.to), source);
    if (s !== undefined) target[f.from] = s;
  }

  private writeNested(target: any, f: ConnectorFieldMap, source: unknown): void {
    if (f.from === undefined) return;
    const s = this.formatField(f, resolvePath(source, f.to), source);
    if (s !== undefined) setPath(target, f.from, s);
  }

  private formatField(f: ConnectorFieldMap, value: unknown, source: unknown): string | undefined {
    let v = value;
    if (v === undefined || v === null || v === '') {
      if (f.default !== undefined) v = f.default;
      else return undefined;
    }
    // Mirror of ingest: explicit reverse transforms first, then wire-facing decimal formatting.
    // `source` is the canonical record, so lookup ops (divideByLookup) can resolve their key.
    if (f.emitTransform) v = applyTransforms(v, f.emitTransform, { record: source, refData: this.refData });
    if (f.decimal !== undefined) return applyDecimal(v as string | number, f.decimal);
    return String(v);
  }
}
