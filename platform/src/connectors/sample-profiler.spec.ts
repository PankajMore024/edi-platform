import { profileSample } from './sample-profiler';

describe('sample profiler (G2)', () => {
  it('profiles a multi-order CSV: types, header vs line, doc key + count, suggestions', () => {
    const csv = 'PO_Number,Order_Date,Item_SKU,Qty,Unit_Price\n' +
      '4500,2026-07-31,012345678905,10,18.50\n' +
      '4500,2026-07-31,099887766554,5,44.00\n' +
      '4501,2026-08-01,012345678905,3,18.50\n';
    const p = profileSample({ type: 'csv', sample: csv, docType: '850' });

    expect(p.docKey).toBe('PO_Number');
    expect(p.docCount).toBe(2); // two POs grouped → two canonical docs (G1)
    const by = (path: string) => p.fields.find((f) => f.path === path)!;
    expect(by('PO_Number')).toMatchObject({ line: false, type: 'integer', suggestion: { target: 'poNumber' } });
    expect(by('Order_Date')).toMatchObject({ line: false, type: 'date', suggestion: { target: 'poDate' } });
    expect(by('Item_SKU')).toMatchObject({ line: true, suggestion: { target: 'lines[].sku' } });
    expect(by('Qty')).toMatchObject({ line: true, type: 'integer', suggestion: { target: 'lines[].quantity.value' } });
    expect(by('Unit_Price')).toMatchObject({ line: true, type: 'decimal', suggestion: { target: 'lines[].unitPrice.amount' } });
    expect(p.mappedCount).toBe(5);
    expect(p.unmatchedCount).toBe(0);
  });

  it('profiles an API JSON payload: array → line fields, scalars → header, unmatched flagged', () => {
    const json = JSON.stringify({ name: '#1001', created_at: '2026-08-01', currency: 'USD', line_items: [{ sku: 'A1', quantity: 2, price: '9.99' }] });
    const p = profileSample({ type: 'json', sample: json, docType: '850' });

    const by = (path: string) => p.fields.find((f) => f.path === path)!;
    expect(by('name')).toMatchObject({ line: false, suggestion: { target: 'poNumber' } });
    expect(by('line_items[].sku')).toMatchObject({ line: true, suggestion: { target: 'lines[].sku' } });
    expect(by('line_items[].quantity')).toMatchObject({ line: true, suggestion: { target: 'lines[].quantity.value' } });
    expect(by('currency').suggestion).toBeUndefined(); // no canonical target → left for review
    expect(p.unmatchedCount).toBe(1);
  });

  it('maps 810 invoice fields to their canonical targets', () => {
    const csv = 'Invoice_No,Invoice_Date,Total,SKU,Qty\nINV-1,2026-08-01,59.97,A1,3\n';
    const p = profileSample({ type: 'csv', sample: csv, docType: '810' });
    const t = (path: string) => p.fields.find((f) => f.path === path)!.suggestion?.target;
    expect(t('Invoice_No')).toBe('invoiceNumber');
    expect(t('Total')).toBe('totalAmount');
    expect(t('SKU')).toBe('lines[].sku');
  });
});
