import { Injectable } from '@nestjs/common';

/**
 * Allocates monotonically increasing control numbers (ISA13 / GS06 / ST02), scoped by (tenant, scope).
 * Async so a durable, atomic store can back it — duplicate or raced control numbers are a top source of
 * real EDI incidents, so the running app binds this to the DB-backed ControlNumberRepository. The
 * in-memory implementation below is for unit tests only (non-durable, non-atomic across processes).
 */
export abstract class ControlNumberService {
  abstract next(tenantId: string, scope: string, start?: number): Promise<string>;
  abstract nextPadded(tenantId: string, scope: string, width: number, start?: number): Promise<string>;
}

@Injectable()
export class InMemoryControlNumberService extends ControlNumberService {
  private readonly counters = new Map<string, number>();

  async next(tenantId: string, scope: string, start = 1): Promise<string> {
    const k = `${tenantId} ${scope}`;
    const current = this.counters.has(k) ? (this.counters.get(k) as number) + 1 : start;
    this.counters.set(k, current);
    return String(current);
  }

  async nextPadded(tenantId: string, scope: string, width: number, start = 1): Promise<string> {
    return (await this.next(tenantId, scope, start)).padStart(width, '0').slice(-width);
  }
}
