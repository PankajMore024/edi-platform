import { DocSpec } from '../spec.types';

/**
 * House-format 855 Purchase Order Acknowledgment (client-authoritative — WE own this spec; the
 * partner's returned 855 is validated against it). Mirrors what SAMPLE_855_MAP emits: BAK header,
 * an optional N1 party loop, a PO1 line loop each optionally carrying an ACK line-status segment,
 * and a CTT total. Codes are the real ASC X12 004010 855 code lists (our reference data).
 */
export const HOUSE_855: DocSpec = {
  docType: '855',
  version: '004010',
  owner: 'client',
  name: 'House Format 855 Purchase Order Acknowledgment',
  segments: [
    {
      tag: 'BAK',
      name: 'Beginning Segment for Purchase Order Acknowledgment',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Transaction Set Purpose Code', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['00', '01', '05', '06', '07', '14'] },
        { pos: 2, name: 'Acknowledgment Type', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['AC', 'AD', 'AE', 'AH', 'AK', 'AP', 'AT', 'RD', 'RF', 'RJ', 'RO'] },
        { pos: 3, name: 'Purchase Order Number', requirement: 'mandatory', type: 'AN', min: 1, max: 22 },
        { pos: 4, name: 'Date', requirement: 'mandatory', type: 'DT', min: 8, max: 8 },
      ],
    },
    {
      tag: 'N1',
      name: 'Party Identification',
      requirement: 'optional',
      elements: [
        { pos: 1, name: 'Entity Identifier Code', requirement: 'mandatory', type: 'ID', min: 2, max: 3, codes: ['ST', 'BT', 'SF', 'BY', 'SE', 'SU', 'VN'] },
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
        { pos: 4, name: 'Unit Price', requirement: 'optional', type: 'R', min: 1, max: 17 },
        { pos: 6, name: 'Product/Service ID Qualifier', requirement: 'conditional', type: 'ID', min: 2, max: 2, codes: ['UP', 'VN', 'UK', 'IN', 'SK'] },
        { pos: 7, name: 'Product/Service ID', requirement: 'conditional', type: 'AN', min: 1, max: 48 },
      ],
    },
    {
      tag: 'ACK',
      name: 'Line Item Acknowledgment',
      requirement: 'optional',
      elements: [
        { pos: 1, name: 'Line Item Status Code', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['IA', 'IB', 'IC', 'ID', 'IF', 'IP', 'IQ', 'IR', 'IS', 'IW', 'AC', 'BP', 'DR'] },
        { pos: 2, name: 'Quantity', requirement: 'conditional', type: 'R', min: 1, max: 15 },
        { pos: 3, name: 'Unit of Measure', requirement: 'conditional', type: 'ID', min: 2, max: 2, codes: ['EA', 'CA', 'PC', 'BX', 'LB', 'FT'] },
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
