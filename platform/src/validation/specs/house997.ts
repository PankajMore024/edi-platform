import { DocSpec } from '../spec.types';

/**
 * House-format 997 Functional Acknowledgment (client-authoritative). AK1 (which functional group is
 * being acked) + AK9 (accept/reject summary). Matches what SAMPLE_997_MAP emits. Correlation
 * (correlate997ToGroup) confirms it acks the GS control number WE sent.
 */
export const HOUSE_997: DocSpec = {
  docType: '997',
  version: '004010',
  owner: 'client',
  name: 'House Format 997 Functional Acknowledgment',
  segments: [
    {
      tag: 'AK1',
      name: 'Functional Group Response Header',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Functional Identifier Code', requirement: 'mandatory', type: 'ID', min: 2, max: 2, codes: ['PO', 'PR', 'SH', 'IN', 'IB', 'FA'] },
        { pos: 2, name: 'Group Control Number', requirement: 'mandatory', type: 'N', min: 1, max: 9 },
      ],
    },
    {
      tag: 'AK9',
      name: 'Functional Group Response Trailer',
      requirement: 'mandatory',
      maxUse: 1,
      elements: [
        { pos: 1, name: 'Functional Group Acknowledge Code', requirement: 'mandatory', type: 'ID', min: 1, max: 1, codes: ['A', 'E', 'P', 'R'] },
        { pos: 2, name: 'Number of Transaction Sets Included', requirement: 'mandatory', type: 'N', min: 1, max: 6 },
        { pos: 3, name: 'Number of Received Transaction Sets', requirement: 'mandatory', type: 'N', min: 1, max: 6 },
        { pos: 4, name: 'Number of Accepted Transaction Sets', requirement: 'mandatory', type: 'N', min: 1, max: 6 },
      ],
    },
  ],
};
