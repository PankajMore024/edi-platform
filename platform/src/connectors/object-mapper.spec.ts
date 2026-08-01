import { ObjectMapper } from './object-mapper';
import { ConnectorMap } from './connector.types';
import { ReferenceDataStore } from '../reference-data/reference-data.store';

describe('ObjectMapper (native → canonical)', () => {
  const mapper = new ObjectMapper();

  it('maps an array of flat records (header from row 0, lines from all rows) with coercion', () => {
    const rows = [
      { 'PO Number': '4500', Line: '1', SKU: 'A1', Qty: '10', Price: '18.50' },
      { 'PO Number': '4500', Line: '2', SKU: 'B2', Qty: '5', Price: '44.00' },
    ];
    const map: ConnectorMap = {
      connector: 'flat-file', docType: '850', direction: 'inbound',
      header: [{ to: 'poNumber', from: 'PO Number' }],
      lineTo: 'lineItems',
      lineFields: [
        { to: 'lineNumber', from: 'Line' },
        { to: 'ids.0.value', from: 'SKU' },
        { to: 'quantity.value', from: 'Qty', decimal: 0 },
        { to: 'unitPrice.amount', from: 'Price', decimal: 2 },
      ],
    };
    const doc = mapper.ingest(rows, map) as any;
    expect(doc.poNumber).toBe('4500');
    expect(doc.lineItems).toEqual([
      { lineNumber: '1', ids: [{ value: 'A1' }], quantity: { value: 10 }, unitPrice: { amount: 18.5 } },
      { lineNumber: '2', ids: [{ value: 'B2' }], quantity: { value: 5 }, unitPrice: { amount: 44 } },
    ]);
  });

  it('maps a single nested object via lineOver (API shape)', () => {
    const payload = { orderId: '4500', items: [{ sku: 'A1', qty: 10 }, { sku: 'B2', qty: 5 }] };
    const map: ConnectorMap = {
      connector: 'generic-rest', docType: '850', direction: 'inbound',
      header: [{ to: 'poNumber', from: 'orderId' }],
      lineTo: 'lineItems', lineOver: 'items',
      lineFields: [{ to: 'ids.0.value', from: 'sku' }, { to: 'quantity.value', from: 'qty', decimal: 0 }],
    };
    const doc = mapper.ingest(payload, map) as any;
    expect(doc.poNumber).toBe('4500');
    expect(doc.lineItems).toEqual([
      { ids: [{ value: 'A1' }], quantity: { value: 10 } },
      { ids: [{ value: 'B2' }], quantity: { value: 5 } },
    ]);
  });

  it('emit reverses ingest (flat round-trip, with re-formatting)', () => {
    const rows = [
      { 'PO Number': '4500', Line: '1', SKU: 'A1', Qty: '10', Price: '18.50' },
      { 'PO Number': '4500', Line: '2', SKU: 'B2', Qty: '5', Price: '44.00' },
    ];
    const map: ConnectorMap = {
      connector: 'flat-file', docType: '850', direction: 'inbound',
      header: [{ to: 'poNumber', from: 'PO Number' }],
      lineTo: 'lineItems',
      lineFields: [
        { to: 'lineNumber', from: 'Line' },
        { to: 'ids.0.value', from: 'SKU' },
        { to: 'quantity.value', from: 'Qty', decimal: 0 },
        { to: 'unitPrice.amount', from: 'Price', decimal: 2 },
      ],
    };
    const canonical = mapper.ingest(rows, map);
    expect(mapper.emit(canonical, map)).toEqual(rows); // wire values round-trip
  });

  it('emit produces a nested object when lineOver is set', () => {
    const canonical: any = { poNumber: '4500', lineItems: [{ ids: [{ value: 'A1' }] }] };
    const map: ConnectorMap = {
      connector: 'generic-rest', docType: '850', direction: 'outbound',
      header: [{ to: 'poNumber', from: 'orderId' }],
      lineTo: 'lineItems', lineOver: 'items',
      lineFields: [{ to: 'ids.0.value', from: 'sku' }],
    };
    expect(mapper.emit(canonical, map)).toEqual({ orderId: '4500', items: [{ sku: 'A1' }] });
  });

  it('applies transforms: cases→eaches (× packSize), UOM cross-ref, cents→dollars', () => {
    const refData = new ReferenceDataStore();
    refData.setCrossRef('uom', { CS: 'CA', EA: 'EA' });
    refData.setEnrichment('itemMaster', { A1: { packSize: 12 } });
    const m = new ObjectMapper(refData);
    const rows = [{ SKU: 'A1', Qty: '5', UoM: 'CS', Price: '1850' }];
    const map: ConnectorMap = {
      connector: 'flat-file', docType: '850', direction: 'inbound',
      header: [],
      lineTo: 'lineItems',
      lineFields: [
        { to: 'ids.0.value', from: 'SKU' },
        { to: 'quantity.value', from: 'Qty', transform: [{ op: 'multiplyByLookup', table: 'itemMaster', keyFrom: 'SKU', get: 'packSize' }], decimal: 0 },
        { to: 'quantity.uom', from: 'UoM', transform: [{ op: 'crossref', table: 'uom' }] },
        { to: 'unitPrice.amount', from: 'Price', transform: [{ op: 'divide', by: 100 }], decimal: 2 },
      ],
    };
    const doc = m.ingest(rows, map) as any;
    expect(doc.lineItems[0]).toEqual({
      ids: [{ value: 'A1' }],
      quantity: { value: 60, uom: 'CA' }, // 5 cases × 12
      unitPrice: { amount: 18.5 }, // 1850 cents ÷ 100
    });
  });

  it('round-trips units on emit via explicit reverse transforms (eaches→cases, dollars→cents)', () => {
    const refData = new ReferenceDataStore();
    refData.setCrossRef('uomOut', { CA: 'CS', EA: 'EA' }); // canonical → source (reverse of ingest table)
    refData.setEnrichment('itemMaster', { A1: { packSize: 12 } });
    const m = new ObjectMapper(refData);
    const map: ConnectorMap = {
      connector: 'flat-file', docType: '850', direction: 'outbound',
      header: [],
      lineTo: 'lineItems',
      lineFields: [
        { to: 'ids.0.value', from: 'SKU' },
        { to: 'quantity.value', from: 'Qty', emitTransform: [{ op: 'divideByLookup', table: 'itemMaster', keyFrom: 'ids.0.value', get: 'packSize' }], decimal: 0 },
        { to: 'quantity.uom', from: 'UoM', emitTransform: [{ op: 'crossref', table: 'uomOut' }] },
        { to: 'unitPrice.amount', from: 'Price', emitTransform: [{ op: 'multiply', by: 100 }], decimal: 0 },
      ],
    };
    // canonical (60 eaches of CA at $18.50) → native wire (5 cases of CS at 1850 cents)
    const canonical = { lineItems: [{ ids: [{ value: 'A1' }], quantity: { value: 60, uom: 'CA' }, unitPrice: { amount: 18.5 } }] };
    expect(m.emit(canonical, map)).toEqual([{ SKU: 'A1', Qty: '5', UoM: 'CS', Price: '1850' }]);
  });

  it('applies const and default; skips absent optional fields', () => {
    const map: ConnectorMap = {
      connector: 'x', docType: '850', direction: 'inbound',
      header: [
        { to: 'purpose', const: '00' },
        { to: 'currency', from: 'Curr', default: 'USD' },
        { to: 'note', from: 'Note' },
      ],
    };
    const doc = mapper.ingest([{ Curr: '', Note: '' }], map) as any;
    expect(doc.purpose).toBe('00');
    expect(doc.currency).toBe('USD');
    expect(doc.note).toBeUndefined();
  });
});
