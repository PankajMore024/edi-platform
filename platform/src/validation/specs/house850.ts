import { DocSpec } from '../spec.types';

/**
 * House-format 850 Purchase Order (client-authoritative — WE own this spec; partners comply).
 * Because it's our format, this is real, licensable-free reference data — not an approximation of
 * the ASC X12 standard. It matches what the sample 850 map emits.
 */
export const HOUSE_850: DocSpec = {
  docType: '850',
  version: '004010',
  owner: 'client',
  name: 'House Format 850 Purchase Order',
  segments: [
    {
      tag: 'BEG',
      name: 'Beginning Segment for Purchase Order',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Transaction Set Purpose Code', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['00', '01', '04', '05', '06'] },
        { pos: 2, name: 'Purchase Order Type Code', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['SA', 'BK', 'KN', 'NE', 'OS', 'RL', 'RN'] },
        { pos: 3, name: 'Purchase Order Number', requirement: 'mandatory', type: 'AN', min: 1, max: 22 },
        { pos: 4, name: 'Release Number', requirement: 'optional', type: 'AN', min: 1, max: 30 },
        { pos: 5, name: 'Date', requirement: 'mandatory', type: 'DT', min: 8, max: 8 },
      ],
    },
    {
      tag: 'N1',
      name: 'Party Identification',
      requirement: 'optional',
      elements: [
        { pos: 1, name: 'Entity Identifier Code', requirement: 'mandatory', type: 'ID', min: 2, max: 3, codes: ['ST', 'BT', 'SF', 'BY', 'SE', 'VN'] },
        { pos: 2, name: 'Name', requirement: 'optional', type: 'AN', min: 1, max: 60 },
      ],
    },
    {
      tag: 'PO1',
      name: 'Baseline Item Data',
      requirement: 'mandatory',
      elements: [
        { pos: 1, name: 'Assigned Identification', requirement: 'optional', type: 'AN', min: 1, max: 20 },
        { pos: 2, name: 'Quantity Ordered', requirement: 'mandatory', type: 'R', min: 1, max: 15 },
        { pos: 3, name: 'Unit of Measure', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['EA', 'CA', 'PC', 'BX', 'LB', 'FT'] },
        { pos: 4, name: 'Unit Price', requirement: 'mandatory', type: 'R', min: 1, max: 17 },
        { pos: 6, name: 'Product/Service ID Qualifier', requirement: 'conditional', type: 'ID', min: 2, max: 2, codes: ['UP', 'VN', 'UK', 'IN', 'SK'] },
        { pos: 7, name: 'Product/Service ID', requirement: 'conditional', type: 'AN', min: 1, max: 48 },
      ],
    },
    {
      tag: 'CTT',
      name: 'Transaction Totals',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Number of Line Items', requirement: 'mandatory', type: 'N', min: 1, max: 6 },
      ],
    },
  ],
};
