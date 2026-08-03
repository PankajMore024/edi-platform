import { parse } from 'csv-parse/sync';

/**
 * Deterministic sample profiler (backlog G2). Takes a real client sample — a CSV/xlsx-derived table or
 * an API JSON payload — and infers the field set, types, header-vs-line structure, the document key
 * (for multi-doc files, G1), and auto-suggests canonical bindings by name/synonym/type. This is the
 * engine behind the console's "import sample" step; AI improves the SUGGESTIONS later, but this
 * always runs. Output feeds a ConnectorMap the operator reviews and saves.
 */
export interface ProfiledField {
  /** Column name (CSV) or dotted path (JSON), e.g. `line_items[].sku`. */
  path: string;
  /** True for a repeating line-item field, false for a header field. */
  line: boolean;
  type: 'string' | 'integer' | 'decimal' | 'date';
  sample: string;
  /** Suggested canonical target path + confidence, when a match is found. */
  suggestion?: { target: string; confidence: number };
}

export interface SampleProfile {
  source: 'csv' | 'json';
  fields: ProfiledField[];
  /** For a flat file holding many docs: the grouping key + how many docs were detected (G1). */
  docKey?: string;
  docCount: number;
  mappedCount: number;
  unmatchedCount: number;
}

interface CanonTarget { path: string; line: boolean; syn: string[]; }
const CANON: Record<string, CanonTarget[]> = {
  '850': [
    { path: 'poNumber', line: false, syn: ['po', 'ponumber', 'ordernumber', 'orderid', 'name', 'amazonorderid'] },
    { path: 'poDate', line: false, syn: ['date', 'orderdate', 'createdat', 'purchasedate'] },
    { path: 'lines[].sku', line: true, syn: ['sku', 'item', 'itemsku', 'sellersku', 'itemref', 'itemnumber', 'upc'] },
    { path: 'lines[].quantity.value', line: true, syn: ['qty', 'quantity', 'quantityordered', 'qtyordered'] },
    { path: 'lines[].unitPrice.amount', line: true, syn: ['price', 'unitprice', 'itemprice', 'amount', 'cost'] },
  ],
  '810': [
    { path: 'invoiceNumber', line: false, syn: ['invoice', 'invoiceno', 'invoicenumber', 'docnumber', 'billno'] },
    { path: 'invoiceDate', line: false, syn: ['invoicedate', 'date', 'txndate'] },
    { path: 'totalAmount', line: false, syn: ['total', 'totalamt', 'invoicetotal', 'grandtotal', 'amount'] },
    { path: 'lines[].sku', line: true, syn: ['sku', 'item', 'itemsku', 'itemref'] },
    { path: 'lines[].quantity.value', line: true, syn: ['qty', 'quantity'] },
    { path: 'lines[].unitPrice.amount', line: true, syn: ['price', 'unitprice', 'amount'] },
  ],
};
CANON['855'] = CANON['850'];
CANON['856'] = CANON['850'];

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const lastSeg = (p: string): string => p.replace(/\[\]/g, '').split('.').pop() ?? '';

function inferType(vals: unknown[]): ProfiledField['type'] {
  const s = vals.map((v) => String(v ?? '')).filter((v) => v !== '');
  if (!s.length) return 'string';
  if (s.every((v) => /^-?\d+\.\d+$/.test(v))) return 'decimal';
  if (s.every((v) => /^-?\d+$/.test(v))) return 'integer';
  if (s.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v))) return 'date';
  return 'string';
}

/** Match a field name to a canonical target across BOTH header and line candidates, returning the
 * target's line-ness — so a doc's line fields are identified even in a single-row sample (where the
 * structural header/line heuristic can't distinguish them). */
function suggestAny(fieldPath: string, docType: string): { target: string; confidence: number; line: boolean } | undefined {
  const canon = CANON[docType] ?? CANON['850'];
  const name = norm(lastSeg(fieldPath));
  for (const c of canon) if (c.syn.includes(name)) return { target: c.path, confidence: 0.95, line: c.line };
  for (const c of canon) for (const syn of c.syn) if (name.includes(syn) || syn.includes(name)) return { target: c.path, confidence: 0.78, line: c.line };
  return undefined;
}

function profileCsv(text: string, docType: string): { fields: Omit<ProfiledField, 'suggestion'>[]; docKey?: string; docCount: number } {
  const rows = parse(text, { skip_empty_lines: true, bom: true }) as string[][];
  if (rows.length < 2) throw new Error('need a header row and at least one data row');
  const header = rows[0].map((h) => h.trim());
  const data = rows.slice(1);

  // document key = the column that best matches a *Number canonical field, else column 0
  let keyIdx = 0;
  for (let i = 0; i < header.length; i++) { const s = suggestAny(header[i], docType); if (s && /Number$/.test(s.target)) { keyIdx = i; break; } }
  const groups: Record<string, string[][]> = {};
  for (const r of data) { const g = r[keyIdx]; (groups[g] = groups[g] || []).push(r); }

  const fields = header.map((h, i) => {
    const vals = data.map((r) => r[i]);
    const constWithin = Object.values(groups).every((grp) => grp.every((r) => r[i] === grp[0][i]));
    const isLine = !(i === keyIdx || constWithin);
    return { path: h, line: isLine, type: inferType(vals), sample: String(vals[0] ?? '') };
  });
  return { fields, docKey: header[keyIdx], docCount: Object.keys(groups).length };
}

function profileJson(text: string): { fields: Omit<ProfiledField, 'suggestion'>[]; docCount: number } {
  const obj = JSON.parse(text) as Record<string, unknown>;
  const fields: Omit<ProfiledField, 'suggestion'>[] = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v)) {
      const first = (v[0] ?? {}) as Record<string, unknown>;
      for (const ck of Object.keys(first)) fields.push({ path: `${k}[].${ck}`, line: true, type: inferType([first[ck]]), sample: String(first[ck] ?? '') });
    } else if (v !== null && typeof v === 'object') {
      for (const ck of Object.keys(v as Record<string, unknown>)) fields.push({ path: `${k}.${ck}`, line: false, type: inferType([(v as Record<string, unknown>)[ck]]), sample: String((v as Record<string, unknown>)[ck] ?? '') });
    } else {
      fields.push({ path: k, line: false, type: inferType([v]), sample: String(v ?? '') });
    }
  }
  return { fields, docCount: 1 };
}

export function profileSample(input: { type: 'csv' | 'json'; sample: string; docType: string }): SampleProfile {
  const isJson = input.type === 'json';
  const base = isJson ? { ...profileJson(input.sample), docKey: undefined } : profileCsv(input.sample, input.docType);
  let mapped = 0;
  const fields: ProfiledField[] = base.fields.map((f) => {
    const s = suggestAny(f.path, input.docType);
    if (s) mapped += 1;
    // JSON structure (array vs scalar) is definitive; for CSV the suggestion's line-ness wins over the
    // weak "constant within group" heuristic (a single-row-per-doc sample can't tell header from line).
    const line = isJson ? f.line : (s?.line ?? f.line);
    return { path: f.path, line, type: f.type, sample: f.sample, suggestion: s ? { target: s.target, confidence: s.confidence } : undefined };
  });
  return {
    source: input.type, fields, docKey: (base as { docKey?: string }).docKey, docCount: base.docCount,
    mappedCount: mapped, unmatchedCount: fields.length - mapped,
  };
}
