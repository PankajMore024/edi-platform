import { EmitService } from './emit.service';
import { X12Service } from '../../x12/x12.service';
import { EdiMap } from '../dsl/map.types';
import { SAMPLE_MAP, SAMPLE_DOC } from '../../testing/fixtures';
import { assertGolden } from '../../testing/golden';
import { CanonicalDocument } from '../../canonical/types/document.types';

describe('EmitService', () => {
  const emit = new EmitService();
  const x12 = new X12Service();

  it('emits the sample 850 to the golden fixture (byte-for-byte)', () => {
    const out = x12.serialize(emit.emit(SAMPLE_DOC, SAMPLE_MAP));
    assertGolden('acme/850/outbound/4010.edi', out);
  });

  it('applies decimal scaling, date format, count, qualifier, and gap-fill', () => {
    const segs = emit.emit(SAMPLE_DOC, SAMPLE_MAP);
    const byTag = (t: string) => segs.filter((s) => s.tag === t);

    // date format + gap at BEG04
    expect(byTag('BEG')[0].elements).toEqual(['00', 'SA', '4500', '', '20260731']);
    // decimal scaling (18.5 -> 18.50) + qualifier pair (UP) + gap at PO105
    expect(byTag('PO1')[0].elements).toEqual(['1', '10', 'EA', '18.50', '', 'UP', '012345678905']);
    // count of lineItems
    expect(byTag('CTT')[0].elements).toEqual(['2']);
    // one N1 per party
    expect(byTag('N1').length).toBe(2);
  });

  it('skips a segment whose `when` predicate is false', () => {
    const doc = { meta: SAMPLE_DOC.meta, extensions: { rush: 'N' } } as unknown as CanonicalDocument;
    const map: EdiMap = {
      partner: 'acme',
      docType: '850',
      direction: 'outbound',
      structure: [
        { segment: 'REF', when: "extensions.rush == 'Y'", elements: [{ pos: 1, const: 'RU' }] },
      ],
    };
    expect(emit.emit(doc, map)).toEqual([]);
  });

  it('throws when a `count` path does not resolve to an array (regression)', () => {
    const doc = { meta: SAMPLE_DOC.meta } as unknown as CanonicalDocument;
    const map: EdiMap = {
      partner: 'acme',
      docType: '850',
      direction: 'outbound',
      structure: [{ segment: 'CTT', elements: [{ pos: 1, count: 'lineItem' /* typo */ }] }],
    };
    expect(() => emit.emit(doc, map)).toThrow(/count path/);
  });

  it('falls back to `default` when the path is empty', () => {
    const doc = { meta: SAMPLE_DOC.meta } as unknown as CanonicalDocument;
    const map: EdiMap = {
      partner: 'acme',
      docType: '850',
      direction: 'outbound',
      structure: [{ segment: 'CUR', elements: [{ pos: 1, path: 'currency', default: 'USD' }] }],
    };
    expect(emit.emit(doc, map)[0].elements).toEqual(['USD']);
  });
});
