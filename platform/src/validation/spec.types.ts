/**
 * Doc-type conformance spec (Layer-2 reference data). Defines what a *conformant* document looks
 * like: which segments are required, cardinality, and per-element type/length/code rules. Owner =
 * who authored it (client house format vs an imported partner IG) — see docs/context.md D48/D51.
 *
 * This is the version-/partner-aware reference data. It is validated AGAINST, separately from the
 * pure engine (which stays spec-blind). Scope note: v1 checks segment presence + cardinality +
 * element type/length/code + unknown segments. Strict segment ORDER and loop-nesting validation
 * are a later enhancement.
 */

export type Requirement = 'mandatory' | 'optional' | 'conditional';

/** X12 data types: AN=alphanumeric, N=numeric, R=decimal, ID=code, DT=date, TM=time. */
export type ElementType = 'AN' | 'N' | 'R' | 'ID' | 'DT' | 'TM';

export interface ElementSpec {
  pos: number;
  name?: string;
  requirement: Requirement;
  type?: ElementType;
  /** Min length of the value (when present). */
  min?: number;
  /** Max length of the value. */
  max?: number;
  /** Allowed code list (for ID elements). */
  codes?: string[];
}

export interface SegmentSpec {
  tag: string;
  name?: string;
  requirement: Requirement;
  /** Max occurrences; undefined = unbounded (loop segments). */
  maxUse?: number;
  elements: ElementSpec[];
}

export interface DocSpec {
  docType: string;
  version: string;
  owner: 'client' | 'partner';
  name?: string;
  segments: SegmentSpec[];
}
