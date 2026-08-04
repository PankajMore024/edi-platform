import { DocSpec } from '../spec.types';

/**
 * House-format 846 Inventory Inquiry/Advice (client-authoritative). BIA header + a LIN/QTY loop per
 * item. Standalone feed — it answers no prior document, so there is no cross-doc correlation; only
 * conformance + ingest. Matches what SAMPLE_846_MAP emits.
 */
export const HOUSE_846: DocSpec = {
  docType: '846',
  version: '004010',
  owner: 'client',
  name: 'House Format 846 Inventory Advice',
  segments: [
    {
      tag: 'BIA',
      name: 'Beginning Segment for Inventory Inquiry/Advice',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Transaction Set Purpose Code', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['00', '05', '15', '49'] },
        { pos: 2, name: 'Report Type Code', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['DD', 'SI', 'NP', 'PQ'] },
        { pos: 3, name: 'Reference Identification', requirement: 'mandatory', type: 'AN', min: 1, max: 30 },
        { pos: 4, name: 'Date', requirement: 'mandatory', type: 'DT', min: 8, max: 8 },
      ],
    },
    {
      tag: 'LIN',
      name: 'Item Identification',
      requirement: 'mandatory',
      elements: [
        { pos: 1, name: 'Assigned Identification', requirement: 'optional', type: 'AN', min: 1, max: 20 },
        { pos: 2, name: 'Product/Service ID Qualifier', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['UP', 'VN', 'UK', 'IN', 'SK'] },
        { pos: 3, name: 'Product/Service ID', requirement: 'mandatory', type: 'AN', min: 1, max: 48 },
      ],
    },
    {
      tag: 'QTY',
      name: 'Quantity',
      requirement: 'mandatory',
      elements: [
        { pos: 1, name: 'Quantity Qualifier', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['33', '17', '20', '25'] },
        { pos: 2, name: 'Quantity', requirement: 'mandatory', type: 'R', min: 1, max: 15 },
      ],
    },
  ],
};
