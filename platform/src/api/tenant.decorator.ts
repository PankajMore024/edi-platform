import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The tenant for a request — established by the PrincipalGuard from the presented credentials
 * (`req.tenantId`), so it can't be spoofed. The guard runs before any handler, so it's always set here.
 */
export const Tenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ tenantId?: string }>();
  return req.tenantId as string;
});
