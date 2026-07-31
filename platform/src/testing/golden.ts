import * as fs from 'fs';
import * as path from 'path';

/**
 * Golden-file harness — the backbone of engine correctness. Every (partner, docType, direction,
 * version) map gets a golden test: a fixed input must produce byte-for-byte expected output.
 * Any change that alters a live partner's output fails loudly.
 *
 * Fixtures live under platform/test/golden/. To (re)generate after an intentional change:
 *   UPDATE_GOLDEN=1 npm test
 * Regenerating is a deliberate act — always review the diff before committing.
 */

const GOLDEN_ROOT = path.resolve(__dirname, '../../test/golden');

export function goldenPath(rel: string): string {
  return path.join(GOLDEN_ROOT, rel);
}

/** Read the expected golden content. Throws if missing (unless in UPDATE mode — see assertGolden). */
export function loadGolden(rel: string): string {
  return fs.readFileSync(goldenPath(rel), 'utf8');
}

/**
 * Assert `actual` matches the golden fixture at `rel`. With UPDATE_GOLDEN=1, writes the fixture
 * instead of asserting (bootstrap / intentional update). Use inside a test:
 *   assertGolden('acme/850/outbound/4010.edi', output);
 */
export function assertGolden(rel: string, actual: string): void {
  const p = goldenPath(rel);
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, actual, 'utf8');
    return;
  }
  const expected = fs.readFileSync(p, 'utf8');
  if (actual !== expected) {
    throw new Error(
      `golden mismatch: ${rel}\n--- expected ---\n${expected}\n--- actual ---\n${actual}`,
    );
  }
}

// For a readable inline diff inside a test, prefer:  expect(actual).toBe(loadGolden(rel));
