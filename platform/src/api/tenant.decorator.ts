import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The tenant for a request — established by the ApiKeyGuard from the presented API key (`req.tenantId`),
 * so it can't be spoofed. The guard runs before any handler, so `req.tenantId` is always set here.
 */
export const Tenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ tenantId?: string }>();
  return req.tenantId as string;
});
