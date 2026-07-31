/**
 * Safe path access into the canonical document. NO eval / arbitrary code — dotted keys only,
 * with numeric segments indexing arrays (e.g. "ids.0.value"). This is the read/write primitive
 * both the emit and ingest engines share.
 */

export function resolvePath(ctx: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: any = ctx;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Set a value at a dotted path, creating intermediate objects/arrays as needed. */
export function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur: any = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === null || cur[k] === undefined) {
      cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    } else if (typeof cur[k] !== 'object') {
      // Descending into a primitive would silently drop the write (or throw in strict mode).
      // Fail loudly — it means the map targets conflicting paths.
      throw new Error(`setPath: cannot descend into primitive at "${keys.slice(0, i + 1).join('.')}"`);
    }
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}
