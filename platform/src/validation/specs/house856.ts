import { DocSpec } from '../spec.types';

/**
 * House-format 856 Advance Ship Notice (client-authoritative). Hierarchical: BSN header, then HL
 * levels S(hipment)→O(rder)→I(tem) carrying PRF (PO ref), LIN (item id) and SN1 (qty shipped), closed
 * by CTT. Conformance here is per-segment (presence/cardinality/elements); the HL nesting itself is
 * exercised by ingest/round-trip and the shipment↔order correlation.
 */
export const HOUSE_856: DocSpec = {
  docType: '856',
  version: '004010',
  owner: 'client',
  name: 'House Format 856 Advance Ship Notice',
  segments: [
    {
      tag: 'BSN',
      name: 'Beginning Segment for Ship Notice',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Transaction Set Purpose Code', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['00', '01', '05', '06', '07'] },
        { pos: 2, name: 'Shipment Identification', requirement: 'mandatory', type: 'AN', min: 1, max: 30 },
        { pos: 3, name: 'Date', requirement: 'mandatory', type: 'DT', min: 8, max: 8 },
      ],
    },
    {
      tag: 'HL',
      name: 'Hierarchical Level',
      requirement: 'mandatory',
      elements: [
        { pos: 1, name: 'Hierarchical ID Number', requirement: 'mandatory', type: 'AN', min: 1, max: 12 },
        { pos: 2, name: 'Hierarchical Parent ID Number', requirement: 'conditional', type: 'AN', min: 1, max: 12 },
        { pos: 3, name: 'Hierarchical Level Code', requirement: 'mandatory', type: 'ID', min: 1, max: 2, codes: ['S', 'O', 'I', 'P', 'T'] },
      ],
    },
    {
      tag: 'PRF',
      name: 'Purchase Order Reference',
      requirement: 'optional',
      elements: [
        { pos: 1, name: 'Purchase Order Number', requirement: 'mandatory', type: 'AN', min: 1, max: 22 },
      ],
    },
    {
      tag: 'LIN',
      name: 'Item Identification',
      requirement: 'optional',
      elements: [
        { pos: 1, name: 'Assigned Identification', requirement: 'optional', type: 'AN', min: 1, max: 20 },
        { pos: 2, name: 'Product/Service ID Qualifier', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['UP', 'VN', 'UK', 'IN', 'SK'] },
        { pos: 3, name: 'Product/Service ID', requirement: 'mandatory', type: 'AN', min: 1, max: 48 },
      ],
    },
    {
      tag: 'SN1',
      name: 'Item Detail (Shipment)',
      requirement: 'optional',
      elements: [
        { pos: 1, name: 'Assigned Identification', requirement: 'optional', type: 'AN', min: 1, max: 20 },
        { pos: 2, name: 'Number of Units Shipped', requirement: 'mandatory', type: 'R', min: 1, max: 10 },
        { pos: 3, name: 'Unit of Measure', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['EA', 'CA', 'PC', 'BX', 'LB', 'FT'] },
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
