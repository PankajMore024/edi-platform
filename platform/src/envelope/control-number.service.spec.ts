import { ControlNumberService } from './control-number.service';

describe('ControlNumberService', () => {
  it('increments per scope, isolated across scopes', () => {
    const svc = new ControlNumberService();
    expect(svc.next('a')).toBe('1');
    expect(svc.next('a')).toBe('2');
    expect(svc.next('b')).toBe('1'); // independent scope
    expect(svc.next('a')).toBe('3');
  });

  it('honors a custom start and zero-pads', () => {
    const svc = new ControlNumberService();
    expect(svc.next('iea', 100)).toBe('100');
    expect(svc.nextPadded('iea', 9)).toBe('000000101');
  });
});
