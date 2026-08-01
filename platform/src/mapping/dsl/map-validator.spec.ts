import { MapValidator } from './map-validator';
import { EdiMap } from './map.types';
import {
  SAMPLE_MAP,
  SAMPLE_810_MAP,
  SAMPLE_855_MAP,
  SAMPLE_856_MAP,
  SAMPLE_997_MAP,
} from '../../testing/fixtures';

describe('MapValidator', () => {
  const v = new MapValidator();

  it('accepts all real sample maps (850/810/855/856/997)', () => {
    for (const m of [SAMPLE_MAP, SAMPLE_810_MAP, SAMPLE_855_MAP, SAMPLE_856_MAP, SAMPLE_997_MAP]) {
      const r = v.validate(m);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    }
  });

  describe('shape errors (ajv)', () => {
    it('rejects a missing required field (docType)', () => {
      const bad = { partner: 'a', direction: 'outbound', structure: [{ segment: 'BEG', elements: [{ pos: 1, const: '0' }] }] };
      const r = v.validate(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.join(' ')).toMatch(/docType/);
    });

    it('rejects an element with two value sources (path + const)', () => {
      const bad: any = { partner: 'a', docType: '850', direction: 'outbound', structure: [{ segment: 'BEG', elements: [{ pos: 1, path: 'x', const: '0' }] }] };
      expect(v.validate(bad).valid).toBe(false);
    });

    it('rejects an element with no value source', () => {
      const bad: any = { partner: 'a', docType: '850', direction: 'outbound', structure: [{ segment: 'BEG', elements: [{ pos: 1 }] }] };
      expect(v.validate(bad).valid).toBe(false);
    });

    it('rejects a lowercase segment tag', () => {
      const bad: any = { partner: 'a', docType: '850', direction: 'outbound', structure: [{ segment: 'beg', elements: [{ pos: 1, const: '0' }] }] };
      expect(v.validate(bad).valid).toBe(false);
    });

    it('rejects an unknown docType', () => {
      const bad: any = { partner: 'a', docType: '999', direction: 'outbound', structure: [{ segment: 'BEG', elements: [{ pos: 1, const: '0' }] }] };
      expect(v.validate(bad).valid).toBe(false);
    });
  });

  describe('structural errors (beyond the schema)', () => {
    it('rejects a duplicate position within a segment', () => {
      const bad: EdiMap = { partner: 'a', docType: '850', direction: 'outbound', structure: [{ segment: 'BEG', elements: [{ pos: 1, const: '0' }, { pos: 1, path: 'x' }] }] };
      const r = v.validate(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.join(' ')).toMatch(/position 1 claimed by both/);
    });

    it('rejects `match` on an outbound map', () => {
      const bad: EdiMap = { partner: 'a', docType: '850', direction: 'outbound', structure: [{ segment: 'N1', match: { pos: 1, eq: 'ST' }, elements: [{ pos: 2, path: 'name' }] }] };
      const r = v.validate(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.join(' ')).toMatch(/match is inbound-only/);
    });

    it('accepts `match` on an inbound map', () => {
      const ok: EdiMap = { partner: 'a', docType: '850', direction: 'inbound', structure: [{ segment: 'N1', match: { pos: 1, eq: 'ST' }, elements: [{ pos: 2, path: 'name' }] }] };
      expect(v.validate(ok).valid).toBe(true);
    });

    it('rejects an hl element outside an hl loop', () => {
      const bad: EdiMap = { partner: 'a', docType: '856', direction: 'outbound', structure: [{ segment: 'HL', elements: [{ pos: 1, hl: 'id' }] }] };
      const r = v.validate(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.join(' ')).toMatch(/only valid inside an hl loop/);
    });
  });

  it('assertValid throws on invalid, is silent on valid', () => {
    expect(() => v.assertValid(SAMPLE_MAP)).not.toThrow();
    expect(() => v.assertValid({ partner: 'a' })).toThrow(/Invalid map/);
  });
});
