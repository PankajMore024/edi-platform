import { applyTransforms } from './transforms';
import { ReferenceDataStore } from '../reference-data/reference-data.store';

describe('applyTransforms', () => {
  const refData = new ReferenceDataStore();
  refData.setCrossRef('uom', { CS: 'CA' });
  refData.setEnrichment('itemMaster', { A1: { packSize: 12 } });
  const ctx = (record: unknown = {}) => ({ record, refData });

  it('scalar ops', () => {
    expect(applyTransforms('1850', [{ op: 'divide', by: 100 }], ctx())).toBe(18.5);
    expect(applyTransforms(2, [{ op: 'multiply', by: 3 }], ctx())).toBe(6);
    expect(applyTransforms('1.005', [{ op: 'round', places: 2 }], ctx())).toBe(1.01);
  });

  it('string ops', () => {
    expect(applyTransforms(' ea ', [{ op: 'trim' }, { op: 'upper' }], ctx())).toBe('EA');
  });

  it('crossref maps a code via a reference table', () => {
    expect(applyTransforms('CS', [{ op: 'crossref', table: 'uom' }], ctx())).toBe('CA');
  });

  it('multiplyByLookup: cases × packSize (from item master) = eaches', () => {
    const out = applyTransforms('5', [{ op: 'multiplyByLookup', table: 'itemMaster', keyFrom: 'SKU', get: 'packSize' }], ctx({ SKU: 'A1' }));
    expect(out).toBe(60);
  });

  it('divideByLookup: eaches ÷ packSize = cases (reverse of multiplyByLookup)', () => {
    const out = applyTransforms(60, [{ op: 'divideByLookup', table: 'itemMaster', keyFrom: 'SKU', get: 'packSize' }], ctx({ SKU: 'A1' }));
    expect(out).toBe(5);
  });

  it('divideByLookup refuses a zero pack size rather than corrupt the quantity', () => {
    const rd = new ReferenceDataStore();
    rd.setEnrichment('itemMaster', { Z0: { packSize: 0 } });
    expect(() =>
      applyTransforms(60, [{ op: 'divideByLookup', table: 'itemMaster', keyFrom: 'SKU', get: 'packSize' }], { record: { SKU: 'Z0' }, refData: rd }),
    ).toThrow(/divisor is zero/);
  });

  it('throws on non-numeric scalar input', () => {
    expect(() => applyTransforms('abc', [{ op: 'divide', by: 100 }], ctx())).toThrow(/not a numeric/);
  });
});
