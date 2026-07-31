import { Injectable } from '@nestjs/common';

/**
 * Thin, deterministic X12 codec — the only place that knows raw X12 serialization.
 * We own this (rather than leaning on node-x12's generator) so the byte output is fully
 * deterministic and golden-file testable — a hard requirement for a financial system.
 *
 * A "segment" is a tag + ordered element string values, e.g.
 *   { tag: 'BEG', elements: ['00', 'SA', '4500', '', '20260731'] }
 */
export interface RawSegment {
  tag: string;
  elements: string[];
}

export interface X12Delimiters {
  /** Element separator (ISA16 region). */
  element: string;
  /** Segment terminator. */
  segment: string;
  /** Component (sub-element) separator. */
  component: string;
}

export const DEFAULT_DELIMITERS: X12Delimiters = { element: '*', segment: '~', component: ':' };

@Injectable()
export class X12Service {
  /** Segments → X12 string. Each segment terminated and newline-separated for readability. */
  serialize(segments: RawSegment[], delims: X12Delimiters = DEFAULT_DELIMITERS): string {
    return (
      segments
        .map((s) => [s.tag, ...s.elements].join(delims.element) + delims.segment)
        .join('\n') + '\n'
    );
  }

  /**
   * X12 string → segments. Line breaks between segments are stripped, but element content
   * (including significant trailing spaces in fixed-width fields) is preserved verbatim.
   */
  parse(raw: string, delims: X12Delimiters = DEFAULT_DELIMITERS): RawSegment[] {
    return raw
      .split(delims.segment)
      .map((s) => s.replace(/[\r\n]/g, ''))
      .filter((s) => s.length > 0)
      .map((s) => {
        const [tag, ...elements] = s.split(delims.element);
        return { tag, elements };
      });
  }
}
