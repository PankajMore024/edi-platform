import { Injectable } from '@nestjs/common';

/**
 * Allocates monotonically increasing control numbers (ISA13 / GS06 / ST02), scoped by a key
 * (typically the trading relationship + level).
 *
 * ⚠️ M1 is IN-MEMORY and NOT production-safe: it does not persist and does not guard against
 * concurrent allocation. The production version must allocate ATOMICALLY from a durable store
 * (a DB sequence / SELECT … FOR UPDATE) — duplicate or raced control numbers are a top source of
 * real EDI incidents (see docs/design/quality-and-process.md). Kept minimal here on purpose.
 */
@Injectable()
export class ControlNumberService {
  private readonly counters = new Map<string, number>();

  /** Return the next number for `scope`, starting at `start` on first use. */
  next(scope: string, start = 1): string {
    const current = this.counters.has(scope) ? (this.counters.get(scope) as number) + 1 : start;
    this.counters.set(scope, current);
    return String(current);
  }

  /** Zero-padded variant (e.g. ISA13 width 9, ST02 width 4). */
  nextPadded(scope: string, width: number, start = 1): string {
    return this.next(scope, start).padStart(width, '0').slice(-width);
  }
}
