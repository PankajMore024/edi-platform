import { resolvePath } from './path';

/**
 * The `when` inclusion predicate — deliberately minimal and SAFE (no arbitrary code in maps).
 * Supported forms (add operators only when a real partner forces one — see docs/context.md D6):
 *   "path"                 → include when the value is present (non-null, non-empty)
 *   "path == 'literal'"    → equality
 *   "path != 'literal'"    → inequality
 */
export function evalWhen(expr: string | undefined, ctx: unknown): boolean {
  if (!expr || !expr.trim()) return true;

  const cmp = expr.match(/^\s*(.+?)\s*(==|!=)\s*(.+?)\s*$/);
  if (cmp) {
    const lhs = resolvePath(ctx, cmp[1].trim());
    const rhs = unquote(cmp[3]);
    const l = lhs === null || lhs === undefined ? '' : String(lhs);
    return cmp[2] === '==' ? l === rhs : l !== rhs;
  }

  return isPresent(resolvePath(ctx, expr.trim()));
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
