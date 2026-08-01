import { Injectable } from '@nestjs/common';
import { RawSegment } from '../x12/x12.service';
import { DocSpec, ElementSpec, SegmentSpec } from './spec.types';

/**
 * A structured conformance finding, carrying enough to render a 997 AK3/AK4 (segment/element notes)
 * as well as a human message. `errorCode` is an X12 syntax error code:
 *   - segment-level → AK304 code list (2=unexpected, 3=mandatory missing, 5=exceeds max use)
 *   - element-level → AK403 code list (1=mandatory missing, 4=too long, 5=too short, 6=invalid char,
 *     7=invalid code, 8=invalid date, 9=invalid time)
 */
export interface ConformanceIssue {
  level: 'segment' | 'element';
  segmentTag: string;
  /** 1-based position of the segment in the transaction-set body as received; 0 when absent. */
  segmentPosition: number;
  /** 1-based element ordinal within the segment (element-level issues only). */
  elementPosition?: number;
  errorCode: string;
  /** The offending value, for element issues (feeds AK404). */
  badValue?: string;
  message: string;
}

export interface ConformanceResult {
  valid: boolean;
  errors: string[];
  issues: ConformanceIssue[];
}

// AK304 — segment syntax error codes.
const SEG_UNEXPECTED = '2';
const SEG_MANDATORY_MISSING = '3';
const SEG_EXCEEDS_MAX = '5';
// AK403 — data element syntax error codes.
const EL_MANDATORY_MISSING = '1';
const EL_TOO_LONG = '4';
const EL_TOO_SHORT = '5';
const EL_INVALID_CHAR = '6';
const EL_INVALID_CODE = '7';
const EL_INVALID_DATE = '8';
const EL_INVALID_TIME = '9';

/**
 * Layer-2 conformance validator — pure `(segments, spec) → issues`, a sibling of the engine.
 * Validates a transaction-set BODY (e.g. BEG…CTT, no envelope) against a DocSpec:
 *   - unknown segments (not in the spec)
 *   - mandatory segment presence + cardinality (maxUse)
 *   - per-element: required, length (min/max), data type (numeric/date), code lists
 *
 * Produces STRUCTURED issues (with X12 syntax error codes + positions) and derives the human-readable
 * `errors` strings from them, so there is a single source of truth. Used both ways: outbound (validate
 * what we emit before sending) and inbound (validate what a partner sent). Which spec + who's
 * accountable is decided by the control plane via format_authority.
 */
@Injectable()
export class ConformanceValidator {
  validate(segments: RawSegment[], spec: DocSpec): ConformanceResult {
    const issues: ConformanceIssue[] = [];
    const specByTag = new Map<string, SegmentSpec>(spec.segments.map((s) => [s.tag, s]));
    const counts = new Map<string, number>();

    segments.forEach((seg, idx) => {
      const position = idx + 1; // 1-based position in the body as received
      const ss = specByTag.get(seg.tag);
      if (!ss) {
        issues.push({
          level: 'segment', segmentTag: seg.tag, segmentPosition: position, errorCode: SEG_UNEXPECTED,
          message: `unexpected segment ${seg.tag} (not in ${spec.docType} spec)`,
        });
        return;
      }
      counts.set(seg.tag, (counts.get(seg.tag) ?? 0) + 1);
      for (const el of ss.elements) this.checkElement(seg, position, el, issues);
    });

    for (const ss of spec.segments) {
      const c = counts.get(ss.tag) ?? 0;
      if (ss.requirement === 'mandatory' && c < 1) {
        issues.push({
          level: 'segment', segmentTag: ss.tag, segmentPosition: 0, errorCode: SEG_MANDATORY_MISSING,
          message: `missing mandatory segment ${ss.tag}`,
        });
      }
      if (ss.maxUse !== undefined && c > ss.maxUse) {
        issues.push({
          level: 'segment', segmentTag: ss.tag, segmentPosition: 0, errorCode: SEG_EXCEEDS_MAX,
          message: `segment ${ss.tag} occurs ${c}× (max ${ss.maxUse})`,
        });
      }
    }

    return { valid: issues.length === 0, errors: issues.map((i) => i.message), issues };
  }

  private checkElement(seg: RawSegment, segmentPosition: number, el: ElementSpec, issues: ConformanceIssue[]): void {
    const ref = `${seg.tag}${String(el.pos).padStart(2, '0')}`;
    const val = seg.elements[el.pos - 1] ?? '';
    const push = (errorCode: string, message: string, badValue?: string) =>
      issues.push({ level: 'element', segmentTag: seg.tag, segmentPosition, elementPosition: el.pos, errorCode, badValue, message });

    if (val === '') {
      if (el.requirement === 'mandatory') push(EL_MANDATORY_MISSING, `${ref}: required element missing`);
      return; // optional/conditional & absent — nothing more to check
    }

    if (el.min !== undefined && val.length < el.min) push(EL_TOO_SHORT, `${ref}: too short (${val.length} < ${el.min})`, val);
    if (el.max !== undefined && val.length > el.max) push(EL_TOO_LONG, `${ref}: too long (${val.length} > ${el.max})`, val);
    if ((el.type === 'N' || el.type === 'R') && !/^-?\d+(\.\d+)?$/.test(val)) {
      push(EL_INVALID_CHAR, `${ref}: not numeric ("${val}")`, val);
    }
    if ((el.type === 'DT' || el.type === 'TM') && !/^\d+$/.test(val)) {
      push(el.type === 'DT' ? EL_INVALID_DATE : EL_INVALID_TIME, `${ref}: not a valid ${el.type} ("${val}")`, val);
    }
    if (el.codes && !el.codes.includes(val)) {
      push(EL_INVALID_CODE, `${ref}: code "${val}" not allowed (${el.codes.join('|')})`, val);
    }
  }
}
