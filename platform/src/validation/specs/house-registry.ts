import { DocSpec } from '../spec.types';
import { HOUSE_850 } from './house850';
import { HOUSE_855 } from './house855';
import { HOUSE_856 } from './house856';
import { HOUSE_810 } from './house810';
import { HOUSE_846 } from './house846';
import { HOUSE_997 } from './house997';

/**
 * Built-in house conformance specs keyed by doc type — our reference data (client-authoritative default).
 * A tenant's provisioned DocSpec overrides this when present; otherwise the certification layer validates
 * a partner's file against these.
 */
export const HOUSE_SPECS: Record<string, DocSpec> = {
  '850': HOUSE_850,
  '855': HOUSE_855,
  '856': HOUSE_856,
  '810': HOUSE_810,
  '846': HOUSE_846,
  '997': HOUSE_997,
};
