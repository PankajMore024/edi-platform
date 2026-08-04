import { ConformanceIssue } from '../validation/conformance-validator';

/**
 * Deterministic "AI at the edge" — turns a raw conformance/correlation finding into a plain-English fix
 * the board renders as `aiSuggestion`. Rule-based today (credential-free, testable); a model can later
 * refine or replace these strings. The engine stays deterministic; suggestions are advisory only.
 */

const at = (i: ConformanceIssue): string => `${i.segmentTag}${i.elementPosition != null ? `-${i.elementPosition}` : ''}`;

/** Suggest a fix for a conformance issue, keyed by X12 syntax error code + level. */
export function suggestConformance(i: ConformanceIssue): string | undefined {
  if (i.level === 'segment') {
    switch (i.errorCode) {
      case '3': return `The mandatory ${i.segmentTag} segment is missing — add it.`;
      case '2': return `${i.segmentTag} isn't part of this document's spec — remove it, or it may be mapped to the wrong loop.`;
      case '5': return `${i.segmentTag} appears more times than allowed — collapse it to a single occurrence.`;
      default: return undefined;
    }
  }
  switch (i.errorCode) {
    case '1': return `${at(i)} is required but empty — populate it.`;
    case '4': return `${at(i)} is longer than the spec allows — truncate to the maximum length.`;
    case '5': return `${at(i)} is shorter than the minimum length the spec requires.`;
    case '6': return `${at(i)} contains characters its data type doesn't permit.`;
    case '7': return `${at(i)} value "${i.badValue ?? ''}" isn't in the allowed code list — use a valid code.`;
    case '8': return `${at(i)} isn't a valid CCYYMMDD date.`;
    case '9': return `${at(i)} isn't a valid time value.`;
    default: return undefined;
  }
}

/** Suggest a fix for a cross-doc correlation finding, keyed by its kind. `ref` is the PO/product/total. */
export function suggestCorrelation(kind: string, ref?: string): string | undefined {
  switch (kind) {
    case 'po-mismatch': return `This document references PO ${ref ?? '(none)'}, not the order it should answer — check the PO number.`;
    case 'unknown-line': return `Line ${ref} isn't on the purchase order — remove it or correct the SKU/UPC to one that was ordered.`;
    case 'qty-exceeds': return `Quantity for ${ref} exceeds what was ordered — cap it at the ordered amount.`;
    case 'total-mismatch': return `The stated total (${ref}) doesn't equal the sum of the line extensions — recompute it.`;
    case 'control-mismatch': return `The acknowledgment references a different control number than the group we sent.`;
    default: return undefined;
  }
}
