import { ReferenceDataStore } from './reference-data.store';

describe('ReferenceDataStore', () => {
  it('cross-ref: maps source codes; throws on missing table or value', () => {
    const s = new ReferenceDataStore();
    s.setCrossRef('uom', { CS: 'CA', EA: 'EA' });
    expect(s.crossref('uom', 'CS')).toBe('CA');
    expect(() => s.crossref('uom', 'ZZ')).toThrow(/no cross-ref for "ZZ"/);
    expect(() => s.crossref('nope', 'CS')).toThrow(/table not found/);
  });

  it('enrichment: returns attributes by key; throws on missing', () => {
    const s = new ReferenceDataStore();
    s.setEnrichment('itemMaster', { A1: { packSize: 12 } });
    expect(s.enrich('itemMaster', 'A1')).toEqual({ packSize: 12 });
    expect(() => s.enrich('itemMaster', 'ZZ')).toThrow(/no enrichment for "ZZ"/);
  });
});
