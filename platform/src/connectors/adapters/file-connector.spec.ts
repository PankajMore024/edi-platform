import * as ExcelJS from 'exceljs';
import { CsvConnector } from './csv.connector';
import { XlsxConnector } from './xlsx.connector';
import { ObjectMapper } from '../object-mapper';
import { ConnectorRegistry } from '../connector-registry';
import { ConnectorInstance } from '../connector.types';

describe('File connectors (csv + xlsx as distinct types over a shared codec)', () => {
  const csvConn = () => new CsvConnector(new ObjectMapper(), new ConnectorRegistry());
  const xlsxConn = () => new XlsxConnector(new ObjectMapper(), new ConnectorRegistry());

  const instance = (connectorType: string, settings: Record<string, unknown>): ConnectorInstance => ({
    id: 'ci-1', tenantId: 't1', connectorType,
    settings,
    docTypes: ['850'], trigger: 'file-drop',
    connectorMap: {
      connector: connectorType, docType: '850', direction: 'inbound',
      header: [{ to: 'poNumber', from: 'PO Number' }],
      lineTo: 'lineItems',
      lineFields: [
        { to: 'lineNumber', from: 'Line' },
        { to: 'ids.0.value', from: 'SKU' },
        { to: 'quantity.value', from: 'Qty', decimal: 0 },
        { to: 'unitPrice.amount', from: 'Price', decimal: 2 },
      ],
    },
  });

  it('the two connectors register under distinct types with the file class', () => {
    expect(csvConn().descriptor()).toMatchObject({ id: 'csv', class: 'file' });
    expect(xlsxConn().descriptor()).toMatchObject({ id: 'xlsx', class: 'file' });
  });

  describe('csv', () => {
    const inst = () => instance('csv', { hasHeader: true });

    it('parses a CSV and maps it to canonical', async () => {
      const csv = 'PO Number,Line,SKU,Qty,Price\n4500,1,012345678905,10,18.50\n4500,2,099887766554,5,44.00\n';
      const [doc] = (await csvConn().ingest(csv, inst())) as any[];
      expect(doc.meta.tenantId).toBe('t1');
      expect(doc.poNumber).toBe('4500');
      expect(doc.lineItems).toEqual([
        { lineNumber: '1', ids: [{ value: '012345678905' }], quantity: { value: 10 }, unitPrice: { amount: 18.5 } },
        { lineNumber: '2', ids: [{ value: '099887766554' }], quantity: { value: 5 }, unitPrice: { amount: 44 } },
      ]);
    });

    it('handles quoted fields with embedded commas', async () => {
      const i = inst();
      i.connectorMap.header = [{ to: 'poNumber', from: 'PO Number' }, { to: 'name', from: 'Name' }];
      i.connectorMap.lineTo = undefined;
      i.connectorMap.lineFields = undefined;
      const [doc] = (await csvConn().ingest('PO Number,Name\n4500,"ACME, Inc."\n', i)) as any[];
      expect(doc.name).toBe('ACME, Inc.');
    });

    it('rejects a non-string payload', async () => {
      await expect(csvConn().ingest({ not: 'a string' }, inst())).rejects.toThrow(/string payload/);
    });

    it('emitData renders canonical back to CSV', async () => {
      const doc: any = {
        poNumber: '4500',
        lineItems: [{ lineNumber: '1', ids: [{ value: '012345678905' }], quantity: { value: 10 }, unitPrice: { amount: 18.5 } }],
      };
      const csv = (await csvConn().emitData(doc, inst())) as string;
      expect(csv.split('\n')[0]).toBe('PO Number,Line,SKU,Qty,Price');
      expect(csv).toContain('4500,1,012345678905,10,18.50');
    });
  });

  describe('xlsx', () => {
    const inst = () => instance('xlsx', { hasHeader: true });
    const buildBook = async (rows: (string | number | { formula: string; result: number })[][]): Promise<Buffer> => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Orders');
      rows.forEach((r) => ws.addRow(r));
      return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    };

    it('parses typed xlsx cells (numbers, strings) into canonical', async () => {
      const buf = await buildBook([
        ['PO Number', 'Line', 'SKU', 'Qty', 'Price'],
        ['4500', 1, '012345678905', 10, 18.5],
      ]);
      const [doc] = (await xlsxConn().ingest(buf, inst())) as any[];
      expect(doc.poNumber).toBe('4500');
      expect(doc.lineItems).toEqual([
        { lineNumber: '1', ids: [{ value: '012345678905' }], quantity: { value: 10 }, unitPrice: { amount: 18.5 } },
      ]);
    });

    it('uses a formula cell RESULT, not the formula text', async () => {
      const buf = await buildBook([
        ['PO Number', 'Line', 'SKU', 'Qty', 'Price'],
        ['4500', 1, 'A1', 10, { formula: '2*9.25', result: 18.5 }],
      ]);
      const [doc] = (await xlsxConn().ingest(buf, inst())) as any[];
      expect(doc.lineItems[0].unitPrice).toEqual({ amount: 18.5 });
    });

    it('refuses an Excel error cell rather than ingesting it as data', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Orders');
      ws.addRow(['PO Number', 'Line', 'SKU', 'Qty', 'Price']);
      ws.addRow(['4500', 1, 'A1', 10, 0]);
      ws.getCell('E2').value = { error: '#DIV/0!' } as ExcelJS.CellErrorValue;
      const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
      await expect(xlsxConn().ingest(buf, inst())).rejects.toThrow(/Excel error/);
    });

    it('rejects a non-binary payload', async () => {
      await expect(xlsxConn().ingest('not a buffer', inst())).rejects.toThrow(/Buffer/);
    });

    it('round-trips: emit xlsx → re-ingest recovers the same canonical values', async () => {
      const doc: any = {
        poNumber: '4500',
        lineItems: [
          { lineNumber: '1', ids: [{ value: '012345678905' }], quantity: { value: 10 }, unitPrice: { amount: 18.5 } },
          { lineNumber: '2', ids: [{ value: '099887766554' }], quantity: { value: 5 }, unitPrice: { amount: 44 } },
        ],
      };
      const buf = (await xlsxConn().emitData(doc, inst())) as Buffer;
      expect(Buffer.isBuffer(buf)).toBe(true);
      const [round] = (await xlsxConn().ingest(buf, inst())) as any[];
      expect(round.lineItems).toEqual(doc.lineItems);
    });
  });
});
