import { Injectable } from '@nestjs/common';
import { RawSegment } from '../x12/x12.service';
import { formatDate } from '../mapping/engine/format';

/**
 * Envelope service — wraps/unwraps a transaction body in the X12 interchange envelope
 * (ISA/GS/ST … SE/GE/IEA). TypeScript successor to the old ediTemplateParser.js, now
 * bidirectional and with correct trailers (segment/group/interchange counts).
 *
 * Envelope config is partner-agnostic (harvested shape of kon_x12settings envelope fields).
 * Control numbers come from ControlNumberService; date/time are formatted in UTC via the
 * tested `formatDate` primitive.
 */

export interface EnvelopeConfig {
  authQualifier?: string; // ISA01, default '00'
  authInfo?: string; // ISA02 (10)
  secQualifier?: string; // ISA03, default '00'
  secInfo?: string; // ISA04 (10)
  senderQualifier: string; // ISA05
  senderId: string; // ISA06 (15) + GS02
  receiverQualifier: string; // ISA07
  receiverId: string; // ISA08 (15) + GS03
  controlStandardsId?: string; // ISA11, default 'U'
  controlVersion?: string; // ISA12, default '00401'
  usageIndicator?: string; // ISA15, default 'P'
  componentSeparator?: string; // ISA16, default ':'
  responsibleAgency?: string; // GS07, default 'X'
  gsVersion: string; // GS08, e.g. '004010'
}

/** Control numbers for one interchange. Allocate via ControlNumberService. */
export interface ControlNumbers {
  isa13: string;
  gs06: string;
  st02: string;
}

export interface InterchangeContext {
  config: EnvelopeConfig;
  control: ControlNumbers;
  functionalId: string; // GS01, e.g. 'PO'
  transactionSetCode: string; // ST01, e.g. '850'
  timestamp: Date;
  ackRequested?: boolean; // ISA14
}

const padRight = (s: string, n: number): string => (s ?? '').padEnd(n).slice(0, n);
const padZero = (s: string, n: number): string => String(s).padStart(n, '0').slice(-n);

@Injectable()
export class EnvelopeService {
  /** Wrap a transaction body in a full interchange: ISA, GS, ST, …body, SE, GE, IEA. */
  buildInterchange(body: RawSegment[], ctx: InterchangeContext): RawSegment[] {
    const { config: c, control, functionalId, transactionSetCode, timestamp } = ctx;

    const isa: RawSegment = {
      tag: 'ISA',
      elements: [
        c.authQualifier ?? '00',
        padRight(c.authInfo ?? '', 10),
        c.secQualifier ?? '00',
        padRight(c.secInfo ?? '', 10),
        c.senderQualifier,
        padRight(c.senderId, 15),
        c.receiverQualifier,
        padRight(c.receiverId, 15),
        formatDate(timestamp, 'YYMMDD'),
        formatDate(timestamp, 'HHMM'),
        c.controlStandardsId ?? 'U',
        c.controlVersion ?? '00401',
        padZero(control.isa13, 9),
        ctx.ackRequested ? '1' : '0',
        c.usageIndicator ?? 'P',
        c.componentSeparator ?? ':',
      ],
    };

    const gs: RawSegment = {
      tag: 'GS',
      elements: [
        functionalId,
        c.senderId,
        c.receiverId,
        formatDate(timestamp, 'CCYYMMDD'),
        formatDate(timestamp, 'HHMM'),
        control.gs06,
        c.responsibleAgency ?? 'X',
        c.gsVersion,
      ],
    };

    const st: RawSegment = { tag: 'ST', elements: [transactionSetCode, control.st02] };
    const segmentCount = body.length + 2; // include ST and SE
    const se: RawSegment = { tag: 'SE', elements: [String(segmentCount), control.st02] };
    const ge: RawSegment = { tag: 'GE', elements: ['1', control.gs06] };
    const iea: RawSegment = { tag: 'IEA', elements: ['1', padZero(control.isa13, 9)] };

    return [isa, gs, st, ...body, se, ge, iea];
  }

  /**
   * Unwrap an inbound interchange: extract the transaction body and the header identifiers.
   * (M1: assumes a single functional group / transaction set.)
   */
  parseInterchange(segments: RawSegment[]): {
    control: ControlNumbers;
    functionalId?: string;
    transactionSetCode?: string;
    body: RawSegment[];
  } {
    const isa = segments.find((s) => s.tag === 'ISA');
    const gs = segments.find((s) => s.tag === 'GS');
    const st = segments.find((s) => s.tag === 'ST');
    const envelopeTags = new Set(['ISA', 'GS', 'ST', 'SE', 'GE', 'IEA']);
    const body = segments.filter((s) => !envelopeTags.has(s.tag));

    return {
      control: {
        isa13: isa?.elements[12] ?? '',
        gs06: gs?.elements[5] ?? '',
        st02: st?.elements[1] ?? '',
      },
      functionalId: gs?.elements[0],
      transactionSetCode: st?.elements[0],
      body,
    };
  }
}
