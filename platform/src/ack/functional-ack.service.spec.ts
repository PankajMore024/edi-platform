import { FunctionalAckService, AckRequest, TransactionSetError } from './functional-ack.service';
import { EnvelopeService, EnvelopeConfig } from '../envelope/envelope.service';
import { X12Service } from '../x12/x12.service';
import { ConformanceValidator } from '../validation/conformance-validator';
import { HOUSE_850 } from '../validation/specs/house850';
import { EmitService } from '../mapping/engine/emit.service';
import { SAMPLE_DOC, SAMPLE_MAP } from '../testing/fixtures';

const svc = new FunctionalAckService();

const req = (over: Partial<AckRequest> = {}): AckRequest => ({
  functionalIdCode: 'PO',
  groupControlNumber: '000000042',
  transactionSets: [{ code: '850', controlNumber: '0001', accepted: true }],
  ...over,
});

const tagsOf = (segs: { tag: string }[]) => segs.map((s) => s.tag);
const ak = (segs: { tag: string; elements: string[] }[], tag: string) =>
  segs.find((s) => s.tag === tag)?.elements ?? [];

describe('FunctionalAckService.buildBody', () => {
  it('echoes group + transaction identifiers verbatim (leading zeros preserved)', () => {
    const body = svc.buildBody(req());
    expect(tagsOf(body)).toEqual(['AK1', 'AK2', 'AK5', 'AK9']);
    expect(ak(body, 'AK1')).toEqual(['PO', '000000042']);
    expect(ak(body, 'AK2')).toEqual(['850', '0001']);
  });

  it('AK901=A and all counts equal when every set is accepted', () => {
    const body = svc.buildBody(req({
      transactionSets: [
        { code: '850', controlNumber: '0001', accepted: true },
        { code: '850', controlNumber: '0002', accepted: true },
      ],
    }));
    expect(ak(body, 'AK9')).toEqual(['A', '2', '2', '2']);
    expect(body.filter((s) => s.tag === 'AK5').map((s) => s.elements[0])).toEqual(['A', 'A']);
  });

  it('AK901=R when every set is rejected', () => {
    const body = svc.buildBody(req({
      transactionSets: [{ code: '850', controlNumber: '0001', accepted: false }],
    }));
    expect(ak(body, 'AK5')).toEqual(['R']);
    expect(ak(body, 'AK9')).toEqual(['R', '1', '1', '0']);
  });

  it('AK901=P (partial) when some accepted and some rejected', () => {
    const body = svc.buildBody(req({
      transactionSets: [
        { code: '850', controlNumber: '0001', accepted: true },
        { code: '850', controlNumber: '0002', accepted: false },
        { code: '855', controlNumber: '0003', accepted: true },
      ],
    }));
    expect(ak(body, 'AK9')).toEqual(['P', '3', '3', '2']);
  });

  it('surfaces an envelope count mismatch: AK902 (claimed) ≠ AK903 (received)', () => {
    const body = svc.buildBody(req({ includedCount: 3 })); // sender claimed 3, only 1 received
    expect(ak(body, 'AK9')).toEqual(['A', '3', '1', '1']);
  });

  it('rejects an empty group (nothing to acknowledge → AK901=R, zero counts)', () => {
    const body = svc.buildBody(req({ transactionSets: [] }));
    expect(tagsOf(body)).toEqual(['AK1', 'AK9']);
    expect(ak(body, 'AK9')).toEqual(['R', '0', '0', '0']);
  });

  it('throws rather than emit an unidentifiable acknowledgment', () => {
    expect(() => svc.buildBody(req({ groupControlNumber: '' }))).toThrow();
    expect(() =>
      svc.buildBody(req({ transactionSets: [{ code: '850', controlNumber: '', accepted: true }] })),
    ).toThrow();
  });
});

describe('AK3/AK4 error detail', () => {
  const err = (over: Partial<TransactionSetError>): TransactionSetError => ({ segmentTag: 'PO1', segmentPosition: 3, code: '1', ...over });

  it('renders element errors as one AK3 (code 8) + an AK4 per element, with AK5 AK502=5', () => {
    const body = svc.buildBody(req({
      transactionSets: [{
        code: '850', controlNumber: '0001', accepted: false,
        errors: [
          err({ segmentTag: 'BEG', segmentPosition: 1, elementPosition: 2, code: '7', badValue: 'ZZ' }),
          err({ segmentTag: 'BEG', segmentPosition: 1, elementPosition: 3, code: '1' }),
        ],
      }],
    }));
    expect(tagsOf(body)).toEqual(['AK1', 'AK2', 'AK3', 'AK4', 'AK4', 'AK5', 'AK9']);
    expect(ak(body, 'AK3')).toEqual(['BEG', '1', '', '8']); // segment has data element errors
    const ak4s = body.filter((s) => s.tag === 'AK4').map((s) => s.elements);
    expect(ak4s).toEqual([['2', '', '7', 'ZZ'], ['3', '', '1']]); // bad value echoed only when present
    expect(ak(body, 'AK5')).toEqual(['R', '5']); // AK501 rejected + AK502 segments-in-error
  });

  it('renders a segment-level error as an AK3 with no AK4', () => {
    const body = svc.buildBody(req({
      transactionSets: [{ code: '850', controlNumber: '0001', accepted: false, errors: [err({ segmentTag: 'ZZ', segmentPosition: 9, code: '2' })] }],
    }));
    expect(tagsOf(body)).toEqual(['AK1', 'AK2', 'AK3', 'AK5', 'AK9']);
    expect(ak(body, 'AK3')).toEqual(['ZZ', '9', '', '2']);
  });

  it('an accepted set with no errors emits no AK3/AK4 and a bare AK5', () => {
    const body = svc.buildBody(req());
    expect(tagsOf(body)).toEqual(['AK1', 'AK2', 'AK5', 'AK9']);
    expect(ak(body, 'AK5')).toEqual(['A']);
  });

  it('end-to-end: validator issues → ack AK3/AK4 (bad code + missing element on BEG)', () => {
    const segs = new EmitService().emit(SAMPLE_DOC, SAMPLE_MAP);
    const beg = segs.find((s) => s.tag === 'BEG')!;
    beg.elements[1] = 'ZZ'; // BEG02 invalid code
    beg.elements[2] = ''; // BEG03 required missing
    const result = new ConformanceValidator().validate(segs, HOUSE_850);
    expect(result.valid).toBe(false);

    // control-plane maps ConformanceIssue → TransactionSetError (1:1 field rename)
    const errors: TransactionSetError[] = result.issues.map((i) => ({
      segmentTag: i.segmentTag, segmentPosition: i.segmentPosition, elementPosition: i.elementPosition, code: i.errorCode, badValue: i.badValue,
    }));
    const body = svc.buildBody(req({ transactionSets: [{ code: '850', controlNumber: '0001', accepted: false, errors }] }));

    expect(ak(body, 'AK3')).toEqual(['BEG', expect.any(String), '', '8']);
    const ak4codes = body.filter((s) => s.tag === 'AK4').map((s) => s.elements[2]);
    expect(ak4codes).toEqual(expect.arrayContaining(['1', '7'])); // missing element + invalid code
    expect(ak(body, 'AK5')).toEqual(['R', '5']);
  });
});

describe('997 end-to-end (body → enveloped interchange, sender/receiver swapped)', () => {
  it('wraps the ack in a valid FA/997 interchange addressed back to the sender', () => {
    const env = new EnvelopeService();
    const x12 = new X12Service();

    // We received a group from ACME (sender) addressed to BIGBOX (us). The ack goes back the other way.
    const config: EnvelopeConfig = {
      senderQualifier: 'ZZ', senderId: 'BIGBOX', // us, now the sender of the 997
      receiverQualifier: 'ZZ', receiverId: 'ACME', // them, now the receiver
      gsVersion: '004010',
    };
    const body = svc.buildBody(req());
    const segments = env.buildInterchange(body, {
      config,
      control: { isa13: '77', gs06: '77', st02: '0001' },
      functionalId: 'FA', // 997 lives in the FA functional group
      transactionSetCode: '997',
      timestamp: new Date('2026-08-01T12:00:00Z'),
    });

    const tags = segments.map((s) => s.tag);
    expect(tags).toEqual(['ISA', 'GS', 'ST', 'AK1', 'AK2', 'AK5', 'AK9', 'SE', 'GE', 'IEA']);

    const gs = segments.find((s) => s.tag === 'GS')!;
    expect(gs.elements[0]).toBe('FA'); // GS01
    expect(gs.elements[1]).toBe('BIGBOX'); // GS02 sender
    expect(gs.elements[2]).toBe('ACME'); // GS03 receiver
    expect(segments.find((s) => s.tag === 'ST')!.elements[0]).toBe('997');

    // SE count includes ST + body + SE = 4 body-ish segments + envelope
    const se = segments.find((s) => s.tag === 'SE')!;
    expect(se.elements[0]).toBe(String(body.length + 2));

    // serializes deterministically
    expect(x12.serialize(segments)).toContain('ST*997*0001~');
  });
});
