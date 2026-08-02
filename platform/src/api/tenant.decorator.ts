import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The tenant for a request, from the `x-tenant-id` header. M1 has no auth yet — a JWT/API-key guard
 * that establishes the tenant is a follow-up; for now every endpoint is explicitly tenant-scoped so
 * the isolation boundary is already in the code. Defaults to `t1` for local dev.
 */
export const Tenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
  return req.headers['x-tenant-id'] || 't1';
});
