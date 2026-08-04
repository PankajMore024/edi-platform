import { CanonicalDocument } from '../canonical/types/document.types';

/**
 * Representative canonical documents per doc type, with placeholder-but-conforming values. Emitting one
 * through a configured map produces a gold reference sample the counterparty can build against — so the
 * authoritative side never hand-authors X12. Values are deliberately obvious samples (SMPL…). This is
 * reference data, not a fixture; the emit is deterministic.
 */
const meta = (docType: string) => ({ docType, direction: 'outbound' as const, partner: '', tenantId: '' });

export const REFERENCE_TEMPLATES: Record<string, CanonicalDocument> = {
  '850': {
    meta: meta('850'), poNumber: 'SMPL0001', poDate: '2026-01-01',
    parties: [{ role: 'ST', address: { name: 'Sample Ship-To' } }],
    lineItems: [{ lineNumber: '1', quantity: { value: 1, uom: 'EA' }, unitPrice: { amount: 1 }, ids: [{ type: 'upc', value: '000000000000' }] }],
  } as CanonicalDocument,
  '855': {
    meta: meta('855'), poNumber: 'SMPL0001', ackType: 'AC', ackDate: '2026-01-01',
    parties: [{ role: 'ST', address: { name: 'Sample Ship-To' } }],
    lineItems: [{ lineNumber: '1', quantity: { value: 1, uom: 'EA' }, unitPrice: { amount: 1 }, ids: [{ type: 'upc', value: '000000000000' }], ackStatus: 'IA' }],
  } as CanonicalDocument,
  '856': {
    meta: meta('856'), shipmentId: 'SMPLSHIP', shipDate: '2026-01-01',
    orders: [{ poNumber: 'SMPL0001', items: [{ lineNumber: '1', quantity: { value: 1, uom: 'EA' }, ids: [{ type: 'upc', value: '000000000000' }] }] }],
  } as CanonicalDocument,
  '810': {
    meta: meta('810'), invoiceNumber: 'SMPLINV', invoiceDate: '2026-01-01', poNumber: 'SMPL0001',
    parties: [{ role: 'BT', address: { name: 'Sample Bill-To' } }],
    lineItems: [{ lineNumber: '1', quantity: { value: 1, uom: 'EA' }, unitPrice: { amount: 1 }, ids: [{ type: 'upc', value: '000000000000' }] }],
    totalAmount: 1,
  } as CanonicalDocument,
  '846': {
    meta: meta('846'), reportType: 'DD', referenceId: 'SMPLINV', reportDate: '2026-01-01',
    items: [{ lineNumber: '1', quantity: { value: 1 }, ids: [{ type: 'upc', value: '000000000000' }] }],
  } as CanonicalDocument,
  '997': {
    meta: meta('997'), ackFunctionalId: 'PO', ackGroupControlNumber: '1', ackCode: 'A', setsIncluded: '1', setsReceived: '1', setsAccepted: '1',
  } as CanonicalDocument,
};
