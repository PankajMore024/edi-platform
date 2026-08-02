import { InMemoryControlNumberService } from './control-number.service';

describe('InMemoryControlNumberService', () => {
  it('increments per (tenant, scope), isolated across scopes and tenants', async () => {
    const svc = new InMemoryControlNumberService();
    expect(await svc.next('t1', 'a')).toBe('1');
    expect(await svc.next('t1', 'a')).toBe('2');
    expect(await svc.next('t1', 'b')).toBe('1'); // independent scope
    expect(await svc.next('t2', 'a')).toBe('1'); // independent tenant
    expect(await svc.next('t1', 'a')).toBe('3');
  });

  it('honors a custom start and zero-pads', async () => {
    const svc = new InMemoryControlNumberService();
    expect(await svc.next('t1', 'iea', 100)).toBe('100');
    expect(await svc.nextPadded('t1', 'iea', 9)).toBe('000000101');
  });
});
