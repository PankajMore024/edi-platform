import { evalWhen } from './predicate';

describe('evalWhen', () => {
  const ctx = { flag: 'Y', name: 'ACME', items: [1], empty: '', missing: null };

  it('undefined/blank predicate is always true', () => {
    expect(evalWhen(undefined, ctx)).toBe(true);
    expect(evalWhen('  ', ctx)).toBe(true);
  });

  it('bare path checks presence', () => {
    expect(evalWhen('name', ctx)).toBe(true);
    expect(evalWhen('items', ctx)).toBe(true);
    expect(evalWhen('empty', ctx)).toBe(false);
    expect(evalWhen('missing', ctx)).toBe(false);
    expect(evalWhen('absent', ctx)).toBe(false);
  });

  it('equality and inequality against a literal', () => {
    expect(evalWhen("flag == 'Y'", ctx)).toBe(true);
    expect(evalWhen("flag == 'N'", ctx)).toBe(false);
    expect(evalWhen("flag != 'N'", ctx)).toBe(true);
    expect(evalWhen('name == "ACME"', ctx)).toBe(true);
  });
});
