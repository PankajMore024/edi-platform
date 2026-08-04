import { EdiMap } from '../mapping/dsl/map.types';
import {
  Order850,
  Invoice810,
  Ack855,
  Ship856,
  Ack997,
  Inventory846,
} from '../canonical/types/document.types';

/**
 * A small but representative 850 map + canonical doc, used by the golden round-trip tests.
 * Exercises: const, path, count, over (loops), decimal, date format, and qualifier pairs.
 * (Note: `role` carries the X12 code directly here; canonical-role ↔ X12-code cross-reference
 * is a later operator — see docs/design/target-architecture.md.)
 */
export const SAMPLE_MAP: EdiMap = {
  partner: 'acme',
  docType: '850',
  direction: 'outbound',
  functionalId: 'PO',
  version: '004010',
  structure: [
    {
      segment: 'BEG',
      elements: [
        { pos: 1, const: '00' },
        { pos: 2, const: 'SA' },
        { pos: 3, path: 'poNumber' },
        { pos: 5, path: 'poDate', format: 'CCYYMMDD' },
      ],
    },
    {
      loop: 'N1',
      over: 'parties',
      segments: [
        {
          segment: 'N1',
          elements: [
            { pos: 1, path: 'role' },
            { pos: 2, path: 'address.name' },
          ],
        },
      ],
    },
    {
      loop: 'PO1',
      over: 'lineItems',
      segments: [
        {
          segment: 'PO1',
          elements: [
            { pos: 1, path: 'lineNumber' },
            { pos: 2, path: 'quantity.value', decimal: 0 },
            { pos: 3, path: 'quantity.uom' },
            { pos: 4, path: 'unitPrice.amount', decimal: 2 },
            { pos: 7, path: 'ids.0.value', qualifier: { pos: 6, const: 'UP' } },
          ],
        },
      ],
    },
    {
      segment: 'CTT',
      elements: [{ pos: 1, count: 'lineItems' }],
    },
  ],
};

export const SAMPLE_DOC: Order850 = {
  meta: { docType: '850', direction: 'outbound', partner: 'acme', tenantId: 't1' },
  poNumber: '4500',
  poDate: '2026-07-31',
  parties: [
    { role: 'ST', address: { name: 'ACME WAREHOUSE' } },
    { role: 'BT', address: { name: 'ACME HQ' } },
  ],
  lineItems: [
    {
      lineNumber: '1',
      quantity: { value: 10, uom: 'EA' },
      unitPrice: { amount: 18.5 },
      ids: [{ type: 'upc', value: '012345678905' }],
    },
    {
      lineNumber: '2',
      quantity: { value: 5, uom: 'EA' },
      unitPrice: { amount: 44 },
      ids: [{ type: 'upc', value: '099887766554' }],
    },
  ],
};

/**
 * A completely different doc type (810 invoice: BIG / IT1 / TDS segments) — proof the engine is
 * doc-type-agnostic. The SAME emit/ingest/envelope services handle it with zero code change.
 */
export const SAMPLE_810_MAP: EdiMap = {
  partner: 'acme',
  docType: '810',
  direction: 'outbound',
  functionalId: 'IN',
  version: '004010',
  structure: [
    {
      segment: 'BIG',
      elements: [
        { pos: 1, path: 'invoiceDate', format: 'CCYYMMDD' },
        { pos: 2, path: 'invoiceNumber' },
        { pos: 4, path: 'poNumber' },
      ],
    },
    {
      loop: 'N1',
      over: 'parties',
      segments: [
        {
          segment: 'N1',
          elements: [
            { pos: 1, path: 'role' },
            { pos: 2, path: 'address.name' },
          ],
        },
      ],
    },
    {
      loop: 'IT1',
      over: 'lineItems',
      segments: [
        {
          segment: 'IT1',
          elements: [
            { pos: 1, path: 'lineNumber' },
            { pos: 2, path: 'quantity.value', decimal: 0 },
            { pos: 3, path: 'quantity.uom' },
            { pos: 4, path: 'unitPrice.amount', decimal: 2 },
            { pos: 7, path: 'ids.0.value', qualifier: { pos: 6, const: 'UP' } },
          ],
        },
      ],
    },
    { segment: 'TDS', elements: [{ pos: 1, path: 'totalAmount', decimal: 2 }] },
    { segment: 'CTT', elements: [{ pos: 1, count: 'lineItems' }] },
  ],
};

export const SAMPLE_810_DOC: Invoice810 = {
  meta: { docType: '810', direction: 'outbound', partner: 'acme', tenantId: 't1' },
  invoiceNumber: 'INV-77',
  invoiceDate: '2026-07-31',
  poNumber: '4500',
  parties: [{ role: 'BT', address: { name: 'ACME HQ' } }],
  lineItems: [
    {
      lineNumber: '1',
      quantity: { value: 10, uom: 'EA' },
      unitPrice: { amount: 18.5 },
      ids: [{ type: 'upc', value: '012345678905' }],
    },
    {
      lineNumber: '2',
      quantity: { value: 5, uom: 'EA' },
      unitPrice: { amount: 44 },
      ids: [{ type: 'upc', value: '099887766554' }],
    },
  ],
  totalAmount: 405, // 10×18.50 + 5×44.00
};

/* ---------- 855 Purchase Order Acknowledgment (BAK / PO1+ACK loop) ---------- */
export const SAMPLE_855_MAP: EdiMap = {
  partner: 'acme',
  docType: '855',
  direction: 'outbound',
  functionalId: 'PR',
  version: '004010',
  structure: [
    {
      segment: 'BAK',
      elements: [
        { pos: 1, const: '00' },
        { pos: 2, path: 'ackType' },
        { pos: 3, path: 'poNumber' },
        { pos: 4, path: 'ackDate', format: 'CCYYMMDD' },
      ],
    },
    {
      loop: 'N1',
      over: 'parties',
      segments: [
        { segment: 'N1', elements: [{ pos: 1, path: 'role' }, { pos: 2, path: 'address.name' }] },
      ],
    },
    {
      loop: 'PO1',
      over: 'lineItems',
      segments: [
        {
          segment: 'PO1',
          elements: [
            { pos: 1, path: 'lineNumber' },
            { pos: 2, path: 'quantity.value', decimal: 0 },
            { pos: 3, path: 'quantity.uom' },
            { pos: 4, path: 'unitPrice.amount', decimal: 2 },
            { pos: 7, path: 'ids.0.value', qualifier: { pos: 6, const: 'UP' } },
          ],
        },
        {
          segment: 'ACK',
          elements: [
            { pos: 1, path: 'ackStatus' },
            { pos: 2, path: 'quantity.value', decimal: 0 },
            { pos: 3, path: 'quantity.uom' },
          ],
        },
      ],
    },
    { segment: 'CTT', elements: [{ pos: 1, count: 'lineItems' }] },
  ],
};

export const SAMPLE_855_DOC: Ack855 = {
  meta: { docType: '855', direction: 'outbound', partner: 'acme', tenantId: 't1' },
  poNumber: '4500',
  ackType: 'AC',
  ackDate: '2026-07-31',
  parties: [{ role: 'ST', address: { name: 'ACME WAREHOUSE' } }],
  lineItems: [
    { lineNumber: '1', quantity: { value: 10, uom: 'EA' }, unitPrice: { amount: 18.5 }, ids: [{ type: 'upc', value: '012345678905' }], ackStatus: 'IA' },
    { lineNumber: '2', quantity: { value: 5, uom: 'EA' }, unitPrice: { amount: 44 }, ids: [{ type: 'upc', value: '099887766554' }], ackStatus: 'IA' },
  ],
};

/* ---------- 856 Advance Ship Notice (BSN + HL hierarchy: S → O → I) ---------- */
export const SAMPLE_856_MAP: EdiMap = {
  partner: 'acme',
  docType: '856',
  direction: 'outbound',
  functionalId: 'SH',
  version: '004010',
  structure: [
    {
      segment: 'BSN',
      elements: [
        { pos: 1, const: '00' },
        { pos: 2, path: 'shipmentId' },
        { pos: 3, path: 'shipDate', format: 'CCYYMMDD' },
      ],
    },
    {
      loop: 'HL_S',
      hl: 'S',
      segments: [
        { segment: 'HL', elements: [{ pos: 1, hl: 'id' }, { pos: 2, hl: 'parent' }, { pos: 3, const: 'S' }] },
        {
          loop: 'HL_O',
          hl: 'O',
          over: 'orders',
          segments: [
            { segment: 'HL', elements: [{ pos: 1, hl: 'id' }, { pos: 2, hl: 'parent' }, { pos: 3, const: 'O' }] },
            { segment: 'PRF', elements: [{ pos: 1, path: 'poNumber' }] },
            {
              loop: 'HL_I',
              hl: 'I',
              over: 'items',
              segments: [
                { segment: 'HL', elements: [{ pos: 1, hl: 'id' }, { pos: 2, hl: 'parent' }, { pos: 3, const: 'I' }] },
                { segment: 'LIN', elements: [{ pos: 1, path: 'lineNumber' }, { pos: 2, const: 'UP' }, { pos: 3, path: 'ids.0.value' }] },
                { segment: 'SN1', elements: [{ pos: 2, path: 'quantity.value', decimal: 0 }, { pos: 3, path: 'quantity.uom' }] },
              ],
            },
          ],
        },
      ],
    },
    { segment: 'CTT', elements: [{ pos: 1, count: 'orders' }] },
  ],
};

export const SAMPLE_856_DOC: Ship856 = {
  meta: { docType: '856', direction: 'outbound', partner: 'acme', tenantId: 't1' },
  shipmentId: 'SHIP-1',
  shipDate: '2026-07-31',
  orders: [
    {
      poNumber: '4500',
      items: [
        { lineNumber: '1', quantity: { value: 10, uom: 'EA' }, ids: [{ type: 'upc', value: '012345678905' }] },
        { lineNumber: '2', quantity: { value: 5, uom: 'EA' }, ids: [{ type: 'upc', value: '099887766554' }] },
      ],
    },
  ],
};

/* ---------- 997 Functional Acknowledgment (AK1 / AK9) ---------- */
export const SAMPLE_997_MAP: EdiMap = {
  partner: 'acme',
  docType: '997',
  direction: 'outbound',
  functionalId: 'FA',
  version: '004010',
  structure: [
    { segment: 'AK1', elements: [{ pos: 1, path: 'ackFunctionalId' }, { pos: 2, path: 'ackGroupControlNumber' }] },
    {
      segment: 'AK9',
      elements: [
        { pos: 1, path: 'ackCode' },
        { pos: 2, path: 'setsIncluded' },
        { pos: 3, path: 'setsReceived' },
        { pos: 4, path: 'setsAccepted' },
      ],
    },
  ],
};

export const SAMPLE_997_DOC: Ack997 = {
  meta: { docType: '997', direction: 'outbound', partner: 'acme', tenantId: 't1' },
  ackFunctionalId: 'PO',
  ackGroupControlNumber: '1',
  ackCode: 'A',
  setsIncluded: '1',
  setsReceived: '1',
  setsAccepted: '1',
};

/* ---------- 846 Inventory Advice (BIA + LIN/QTY loop) — standalone feed ---------- */
export const SAMPLE_846_MAP: EdiMap = {
  partner: 'acme',
  docType: '846',
  direction: 'outbound',
  functionalId: 'IB',
  version: '004010',
  structure: [
    {
      segment: 'BIA',
      elements: [
        { pos: 1, const: '00' },
        { pos: 2, path: 'reportType' },
        { pos: 3, path: 'referenceId' },
        { pos: 4, path: 'reportDate', format: 'CCYYMMDD' },
      ],
    },
    {
      loop: 'LIN',
      over: 'items',
      segments: [
        { segment: 'LIN', elements: [{ pos: 1, path: 'lineNumber' }, { pos: 2, const: 'UP' }, { pos: 3, path: 'ids.0.value' }] },
        { segment: 'QTY', elements: [{ pos: 1, const: '33' }, { pos: 2, path: 'quantity.value', decimal: 0 }] },
      ],
    },
  ],
};

export const SAMPLE_846_DOC: Inventory846 = {
  meta: { docType: '846', direction: 'outbound', partner: 'acme', tenantId: 't1' },
  reportType: 'DD',
  referenceId: 'INV-0804',
  reportDate: '2026-08-04',
  items: [
    { lineNumber: '1', quantity: { value: 120 }, ids: [{ type: 'upc', value: '012345678905' }] },
    { lineNumber: '2', quantity: { value: 45 }, ids: [{ type: 'upc', value: '099887766554' }] },
  ],
};
