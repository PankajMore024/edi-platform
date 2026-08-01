import { parse } from 'csv-parse/sync';
import * as ExcelJS from 'exceljs';
import { CanonicalDocument } from '../../canonical/types/document.types';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { Connector, ConnectorDescriptor, ConnectorInstance } from '../connector.types';

/** Per-client parse configuration (data, not code). Shared by the CSV and xlsx file connectors. */
export interface FileParseConfig {
  delimiter?: string; // CSV only, default ','
  hasHeader?: boolean; // default true
  /** xlsx only: worksheet name or 1-based index. Default: the first worksheet. */
  sheet?: string | number;
}

/**
 * Base for file-format connectors — one generic row codec for every client's tabular file. The FILE
 * FORMAT is the connector type (`csv` vs `xlsx`), so each is its own catalog entry; delimiter/header/
 * sheet vary via parse-config and column names/types via the connector-map. Rows (native records) go
 * through the shared ObjectMapper both ways.
 *
 * `type` is a constructor parameter property (assigned before the body), so `this.type` is set when we
 * self-register — a subclass `readonly type` field would still be undefined at super() time (see D61).
 */
export abstract class FileConnector implements Connector {
  constructor(
    readonly type: 'csv' | 'xlsx',
    protected readonly mapper: ObjectMapper,
    registry: ConnectorRegistry,
  ) {
    registry.register(this);
  }

  abstract descriptor(): ConnectorDescriptor;

  async ingest(raw: unknown, instance: ConnectorInstance): Promise<CanonicalDocument[]> {
    const cfg = (instance.settings ?? {}) as unknown as FileParseConfig;
    const records = this.type === 'xlsx' ? await this.parseXlsx(raw, cfg) : this.parseCsv(raw, cfg);

    const doc = this.mapper.ingest(records, instance.connectorMap) as any;
    doc.meta.tenantId = instance.tenantId;
    return [doc];
  }

  async emitData(doc: any, instance: ConnectorInstance): Promise<string | Buffer> {
    const map = instance.connectorMap;
    const cfg = (instance.settings ?? {}) as unknown as FileParseConfig;
    const rows = this.mapper.emit(doc, map) as Record<string, string>[];
    const cols = [...map.header, ...(map.lineFields ?? [])]
      .map((f) => f.from)
      .filter((c): c is string => c !== undefined);

    return this.type === 'xlsx' ? this.toXlsx(cols, rows, cfg) : this.toCsv(cols, rows, cfg.delimiter ?? ',');
  }

  // ── CSV ────────────────────────────────────────────────────────────────────

  private parseCsv(raw: unknown, cfg: FileParseConfig): Record<string, string>[] {
    if (typeof raw !== 'string') throw new Error('csv connector expects a string payload');
    return parse(raw, {
      columns: cfg.hasHeader !== false, // header row → object keys
      delimiter: cfg.delimiter ?? ',',
      skip_empty_lines: true,
      bom: true, // strip a leading BOM (common Excel export artifact)
    }) as unknown as Record<string, string>[];
  }

  private toCsv(cols: string[], rows: Record<string, string>[], delimiter: string): string {
    const esc = (v: string): string =>
      v.includes(delimiter) || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    const line = (vals: string[]): string => vals.map(esc).join(delimiter);
    const body = rows.map((r) => line(cols.map((c) => r[c] ?? '')));
    return [line(cols), ...body].join('\n') + '\n';
  }

  // ── xlsx ───────────────────────────────────────────────────────────────────

  private async parseXlsx(raw: unknown, cfg: FileParseConfig): Promise<Record<string, string>[]> {
    if (!Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) {
      throw new Error('xlsx connector expects a Buffer/Uint8Array payload (binary)');
    }
    const wb = new ExcelJS.Workbook();
    // Library boundary: exceljs types its own Buffer; @types/node's Buffer<ArrayBufferLike> differs.
    await wb.xlsx.load(raw as unknown as ExcelJS.Buffer);

    const ws =
      cfg.sheet === undefined
        ? wb.worksheets[0]
        : typeof cfg.sheet === 'number'
          ? wb.worksheets[cfg.sheet - 1] // 1-based
          : wb.getWorksheet(cfg.sheet);
    if (!ws) throw new Error(`xlsx: worksheet ${JSON.stringify(cfg.sheet)} not found`);

    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = this.cellToString(cell, row.number, colNumber);
      });
      grid.push(cells);
    });
    if (grid.length === 0) return [];

    if (cfg.hasHeader === false) {
      // No header → keys are 1-based column indices as strings ('1','2',…), mirroring header-less CSV.
      return grid.map((cells) => this.rowToObject(cells.map((_, i) => String(i + 1)), cells));
    }
    const [header, ...dataRows] = grid;
    const keys = header.map((h) => (h ?? '').trim());
    return dataRows.map((cells) => this.rowToObject(keys, cells));
  }

  private rowToObject(keys: string[], cells: string[]): Record<string, string> {
    const obj: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (k !== '') obj[k] = cells[i] ?? '';
    });
    return obj;
  }

  /**
   * Normalize one exceljs cell to a deterministic string. This is where xlsx correctness lives:
   * typed numbers, formula results, dates, rich text, hyperlinks all need explicit handling, and an
   * Excel error cell (#DIV/0!, #REF!) must NOT be silently ingested as data.
   */
  private cellToString(cell: ExcelJS.Cell, rowNum: number, colNum: number): string {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof Date) return v.toISOString(); // deterministic; downstream date coercion parses ISO
    if (typeof v === 'object') {
      if ('error' in v) {
        throw new Error(`xlsx: cell ${cell.address} (row ${rowNum}, col ${colNum}) is an Excel error "${String(v.error)}"`);
      }
      if ('result' in v) {
        // formula cell — use the computed result, never the formula text
        const r = (v as ExcelJS.CellFormulaValue).result;
        if (r === null || r === undefined) return '';
        if (r instanceof Date) return r.toISOString();
        if (typeof r === 'object' && 'error' in r) {
          throw new Error(`xlsx: formula at ${cell.address} evaluated to an error "${String((r as ExcelJS.CellErrorValue).error)}"`);
        }
        return String(r);
      }
      if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join('');
      if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text); // hyperlink → display text
    }
    return String(v);
  }

  private async toXlsx(cols: string[], rows: Record<string, string>[], cfg: FileParseConfig): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(typeof cfg.sheet === 'string' ? cfg.sheet : 'Sheet1');
    if (cfg.hasHeader !== false) ws.addRow(cols);
    for (const r of rows) ws.addRow(cols.map((c) => r[c] ?? ''));
    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }
}
