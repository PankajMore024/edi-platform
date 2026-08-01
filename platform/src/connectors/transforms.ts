import Decimal from 'decimal.js';
import { resolvePath } from '../mapping/engine/path';
import { ReferenceDataStore } from '../reference-data/reference-data.store';
import { TransformSpec } from './connector.types';

/**
 * Fixed transform function library — the T2 "transform palette" (no arbitrary code). Applied as an
 * ordered chain during ingest. Scalar ops (multiply/divide/round) handle unit scaling; string ops
 * normalize; `crossref`/`multiplyByLookup` draw on the reference-data subsystem.
 *
 * Note: scalar math uses JS numbers (canonical amounts are numbers); the wire-facing rounding on
 * EMIT is done precisely by applyDecimal (decimal.js). The same library also runs EMIT-side chains
 * (ConnectorFieldMap.emitTransform) — the reverse ops (divide, divideByLookup) live here too.
 */
export interface TransformContext {
  record: unknown;
  refData: ReferenceDataStore;
}

export function applyTransforms(value: unknown, specs: TransformSpec[] | undefined, ctx: TransformContext): unknown {
  let v: unknown = value;
  for (const spec of specs ?? []) v = applyOne(v, spec, ctx);
  return v;
}

function num(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`transform: not a numeric value: "${String(v)}"`);
  return n;
}

function applyOne(v: unknown, s: TransformSpec, ctx: TransformContext): unknown {
  switch (s.op) {
    case 'multiply':
      return num(v) * s.by;
    case 'divide':
      return num(v) / s.by;
    case 'round':
      // decimal-precise (not float Math.round): "1.005" rounds to 1.01, not 1.00
      return new Decimal(String(v)).toDecimalPlaces(s.places, Decimal.ROUND_HALF_UP).toNumber();
    case 'trim':
      return String(v).trim();
    case 'upper':
      return String(v).toUpperCase();
    case 'lower':
      return String(v).toLowerCase();
    case 'crossref':
      return ctx.refData.crossref(s.table, String(v));
    case 'multiplyByLookup': {
      const key = String(resolvePath(ctx.record, s.keyFrom) ?? '');
      const rec = ctx.refData.enrich(s.table, key);
      return num(v) * num(rec[s.get]);
    }
    case 'divideByLookup': {
      const key = String(resolvePath(ctx.record, s.keyFrom) ?? '');
      const rec = ctx.refData.enrich(s.table, key);
      const divisor = num(rec[s.get]);
      // A zero/invalid pack size would yield Infinity and silently corrupt a quantity — refuse it.
      if (divisor === 0) throw new Error(`divideByLookup: divisor is zero (${s.table}.${s.get} for "${key}")`);
      return num(v) / divisor;
    }
  }
}
