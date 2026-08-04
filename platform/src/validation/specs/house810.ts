import { DocSpec } from '../spec.types';

/**
 * House-format 810 Invoice (client-authoritative). BIG header, optional N1 parties, IT1 line loop,
 * TDS total, CTT count. Matches what SAMPLE_810_MAP emits. Correlation additionally reconciles the
 * TDS total against the sum of line extensions (see correlateInvoiceToOrder).
 */
export const HOUSE_810: DocSpec = {
  docType: '810',
  version: '004010',
  owner: 'client',
  name: 'House Format 810 Invoice',
  segments: [
    {
      tag: 'BIG',
      name: 'Beginning Segment for Invoice',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Invoice Date', requirement: 'mandatory', type: 'DT', min: 8, max: 8 },
        { pos: 2, name: 'Invoice Number', requirement: 'mandatory', type: 'AN', min: 1, max: 22 },
        { pos: 4, name: 'Purchase Order Number', requirement: 'conditional', type: 'AN', min: 1, max: 22 },
      ],
    },
    {
      tag: 'N1',
      name: 'Party Identification',
      requirement: 'optional',
      elements: [
        { pos: 1, name: 'Entity Identifier Code', requirement: 'mandatory', type: 'ID', min: 2, max: 3, codes: ['ST', 'BT', 'SF', 'BY', 'SE', 'RE', 'VN'] },
        { pos: 2, name: 'Name', requirement: 'optional', type: 'AN', min: 1, max: 60 },
      ],
    },
    {
      tag: 'IT1',
      name: 'Baseline Item Data (Invoice)',
      requirement: 'mandatory',
      elements: [
        { pos: 1, name: 'Assigned Identification', requirement: 'optional', type: 'AN', min: 1, max: 20 },
        { pos: 2, name: 'Quantity Invoiced', requirement: 'mandatory', type: 'R', min: 1, max: 10 },
        { pos: 3, name: 'Unit of Measure', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['EA', 'CA', 'PC', 'BX', 'LB', 'FT'] },
        { pos: 4, name: 'Unit Price', requirement: 'mandatory', type: 'R', min: 1, max: 17 },
        { pos: 6, name: 'Product/Service ID Qualifier', requirement: 'conditional', type: 'ID', min: 2, max: 2, codes: ['UP', 'VN', 'UK', 'IN', 'SK'] },
        { pos: 7, name: 'Product/Service ID', requirement: 'conditional', type: 'AN', min: 1, max: 48 },
      ],
    },
    {
      tag: 'TDS',
      name: 'Total Monetary Value Summary',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Total Invoice Amount', requirement: 'mandatory', type: 'R', min: 1, max: 15 },
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
