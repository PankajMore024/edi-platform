import { Injectable } from '@nestjs/common';
import { RawSegment } from '../x12/x12.service';
import { DocSpec, ElementSpec, SegmentSpec } from './spec.types';

export interface ConformanceResult {
  valid: boolean;
  errors: string[];
}

/**
 * Layer-2 conformance validator — pure `(segments, spec) → errors`, a sibling of the engine.
 * Validates a transaction-set BODY (e.g. BEG…CTT, no envelope) against a DocSpec:
 *   - unknown segments (not in the spec)
 *   - mandatory segment presence + cardinality (maxUse)
 *   - per-element: required, length (min/max), data type (numeric/date), code lists
 *
 * Used both ways: outbound (validate what we emit before sending) and inbound (validate what a
 * partner sent). Which spec + who's accountable is decided by the control plane via format_authority.
 */
@Injectable()
export class ConformanceValidator {
  validate(segments: RawSegment[], spec: DocSpec): ConformanceResult {
    const errors: string[] = [];
    const specByTag = new Map<string, SegmentSpec>(spec.segments.map((s) => [s.tag, s]));
    const counts = new Map<string, number>();

    for (const seg of segments) {
      const ss = specByTag.get(seg.tag);
      if (!ss) {
        errors.push(`unexpected segment ${seg.tag} (not in ${spec.docType} spec)`);
        continue;
      }
      counts.set(seg.tag, (counts.get(seg.tag) ?? 0) + 1);
      for (const el of ss.elements) this.checkElement(seg, el, errors);
    }

    for (const ss of spec.segments) {
      const c = counts.get(ss.tag) ?? 0;
      if (ss.requirement === 'mandatory' && c < 1) errors.push(`missing mandatory segment ${ss.tag}`);
      if (ss.maxUse !== undefined && c > ss.maxUse) {
        errors.push(`segment ${ss.tag} occurs ${c}× (max ${ss.maxUse})`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private checkElement(seg: RawSegment, el: ElementSpec, errors: string[]): void {
    const ref = `${seg.tag}${String(el.pos).padStart(2, '0')}`;
    const val = seg.elements[el.pos - 1] ?? '';

    if (val === '') {
      if (el.requirement === 'mandatory') errors.push(`${ref}: required element missing`);
      return; // optional/conditional & absent — nothing more to check
    }

    if (el.min !== undefined && val.length < el.min) errors.push(`${ref}: too short (${val.length} < ${el.min})`);
    if (el.max !== undefined && val.length > el.max) errors.push(`${ref}: too long (${val.length} > ${el.max})`);
    if ((el.type === 'N' || el.type === 'R') && !/^-?\d+(\.\d+)?$/.test(val)) {
      errors.push(`${ref}: not numeric ("${val}")`);
    }
    if ((el.type === 'DT' || el.type === 'TM') && !/^\d+$/.test(val)) {
      errors.push(`${ref}: not a valid ${el.type} ("${val}")`);
    }
    if (el.codes && !el.codes.includes(val)) {
      errors.push(`${ref}: code "${val}" not allowed (${el.codes.join('|')})`);
    }
  }
}
