import { suggestConformance, suggestCorrelation } from './suggestion';
import { ConformanceIssue } from '../validation/conformance-validator';

const issue = (over: Partial<ConformanceIssue>): ConformanceIssue => ({
  level: 'element', segmentTag: 'BAK', segmentPosition: 1, errorCode: '1', message: '', ...over,
});

describe('suggestion engine (deterministic AI-at-the-edge)', () => {
  it('explains conformance errors by X12 code + level', () => {
    expect(suggestConformance(issue({ level: 'segment', segmentTag: 'BAK', errorCode: '3' }))).toMatch(/mandatory BAK segment is missing/);
    expect(suggestConformance(issue({ segmentTag: 'BAK', elementPosition: 3, errorCode: '1' }))).toMatch(/BAK-3 is required but empty/);
    expect(suggestConformance(issue({ segmentTag: 'ACK', elementPosition: 1, errorCode: '7', badValue: 'ZZ' }))).toMatch(/"ZZ" isn't in the allowed code list/);
    expect(suggestConformance(issue({ elementPosition: 4, errorCode: '8' }))).toMatch(/valid CCYYMMDD date/);
  });

  it('distinguishes segment vs element code 5 (max-use vs too-short)', () => {
    expect(suggestConformance(issue({ level: 'segment', segmentTag: 'CTT', errorCode: '5' }))).toMatch(/more times than allowed/);
    expect(suggestConformance(issue({ level: 'element', errorCode: '5' }))).toMatch(/shorter than the minimum/);
  });

  it('explains correlation findings by kind', () => {
    expect(suggestCorrelation('po-mismatch', '9999')).toMatch(/references PO 9999/);
    expect(suggestCorrelation('unknown-line', 'SKU-X')).toMatch(/SKU-X isn't on the purchase order/);
    expect(suggestCorrelation('qty-exceeds', 'SKU-A')).toMatch(/exceeds what was ordered/);
    expect(suggestCorrelation('total-mismatch', '500')).toMatch(/doesn't equal the sum/);
    expect(suggestCorrelation('control-mismatch')).toMatch(/different control number/);
  });

  it('returns undefined for unknown codes/kinds (no fabricated advice)', () => {
    expect(suggestConformance(issue({ errorCode: 'ZZ' }))).toBeUndefined();
    expect(suggestCorrelation('nope')).toBeUndefined();
  });
});
