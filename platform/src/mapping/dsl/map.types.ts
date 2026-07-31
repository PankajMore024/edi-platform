/**
 * The declarative per-(partner, docType, direction) map — the load-bearing contract of the
 * whole engine. Partners become DATA, not code.
 *
 * Ported faithfully from docs/schema/edi-map.schema.json (the JSON-Schema that validates maps).
 * Keep this type and that schema in lockstep — the schema validates at load time, this type
 * gives the engine compile-time safety.
 */

export type DocType = '810' | '846' | '850' | '855' | '856' | '997';
export type Direction = 'outbound' | 'inbound';

/** X12 date/time formatting applied to an element value. */
export type ElementFormat = 'CCYYMMDD' | 'YYMMDD' | 'HHMM' | 'HHMMSS';

/**
 * Inbound only: identifies WHICH occurrence of a repeated segment/loop this node matches
 * (e.g. the N1 with N101 === 'ST').
 */
export interface MatchRule {
  /** Element position (1-based) to test. */
  pos: number;
  /** Value the element must equal for this node to apply. */
  eq: string;
}

/**
 * A qualifier element paired with a value element (e.g. REF01 qualifier + REF02 value).
 */
export interface ElementQualifier {
  pos: number;
  const: string;
}

/**
 * One element within a segment. Exactly ONE source of value: `path` | `const` | `count`.
 * `default` / `format` / `decimal` / `qualifier` are modifiers.
 */
export interface MapElement {
  /** Element position within the segment (1-based). */
  pos: number;
  /** Path into the canonical document to read the value from. */
  path?: string;
  /** Literal constant value. */
  const?: string | number | boolean;
  /** Array path whose length becomes the value (e.g. line-item count for CTT). */
  count?: string;
  /** Fallback when the resolved value is empty. */
  default?: string | number;
  /** Date/time formatting to apply. */
  format?: ElementFormat;
  /** Fixed number of decimal places. */
  decimal?: number;
  /** A qualifier element emitted alongside this one. */
  qualifier?: ElementQualifier;
  /** HL hierarchy value (856): emit the current HL id, or its parent's HL id. */
  hl?: 'id' | 'parent';
  $comment?: string;
}

/** A single X12 segment (e.g. BEG, N1, PO1). */
export interface SegmentNode {
  /** Segment id, e.g. "BEG", "N1", "PO1". */
  segment: string;
  /** Inclusion predicate over the canonical doc + config. */
  when?: string;
  /** Array path to repeat this segment across. */
  over?: string;
  /** Inbound: which occurrence this is. */
  match?: MatchRule;
  elements: MapElement[];
  $comment?: string;
}

/** A logical loop grouping segments (e.g. the N1 party loop, the PO1 line loop). */
export interface LoopNode {
  /** Loop id/label. */
  loop: string;
  when?: string;
  over?: string;
  match?: MatchRule;
  /** Marks an HL hierarchy level (e.g. 'S','O','I' for 856); triggers HL id/parent numbering. */
  hl?: string;
  segments: MapNode[];
  $comment?: string;
}

export type MapNode = SegmentNode | LoopNode;

/** The full map document. */
export interface EdiMap {
  partner: string;
  docType: DocType;
  direction: Direction;
  /** GS01 functional identifier (e.g. PO, IN, SH). */
  functionalId?: string;
  /** GS08 version, e.g. 004010. */
  version?: string;
  structure: MapNode[];
  $comment?: string;
}

/** Type guards for walking the structure tree. */
export const isLoopNode = (n: MapNode): n is LoopNode =>
  (n as LoopNode).loop !== undefined;
export const isSegmentNode = (n: MapNode): n is SegmentNode =>
  (n as SegmentNode).segment !== undefined;
