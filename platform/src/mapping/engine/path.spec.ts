import { resolvePath, setPath } from './path';

describe('resolvePath', () => {
  const ctx = { a: { b: 'x' }, list: [{ value: 'first' }, { value: 'second' }] };

  it('reads nested keys', () => {
    expect(resolvePath(ctx, 'a.b')).toBe('x');
  });
  it('indexes arrays with numeric segments', () => {
    expect(resolvePath(ctx, 'list.0.value')).toBe('first');
    expect(resolvePath(ctx, 'list.1.value')).toBe('second');
  });
  it('returns undefined for missing paths (no throw)', () => {
    expect(resolvePath(ctx, 'a.missing.deep')).toBeUndefined();
    expect(resolvePath(ctx, 'nope')).toBeUndefined();
  });
});

describe('setPath', () => {
  it('creates intermediate objects', () => {
    const t: any = {};
    setPath(t, 'a.b.c', 'v');
    expect(t).toEqual({ a: { b: { c: 'v' } } });
  });
  it('creates arrays for numeric segments', () => {
    const t: any = {};
    setPath(t, 'ids.0.value', 'u');
    expect(t).toEqual({ ids: [{ value: 'u' }] });
  });
  it('throws instead of silently dropping a write through a primitive (regression)', () => {
    const t: any = { unitPrice: 'x' };
    expect(() => setPath(t, 'unitPrice.amount', '10')).toThrow(/primitive/);
  });
});
