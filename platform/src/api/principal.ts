import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/** Console roles. An API key authenticates as a machine `client_admin`; users carry their stored role. */
export type Role = 'client_admin' | 'client_ops' | 'partner';

/**
 * The authenticated principal for a request, established by the PrincipalGuard from either an API key
 * (machine → client_admin, unrestricted) or a user session token (a console_user). A `partner` carries
 * `scopes` — the relationship ids it may see; client roles are unrestricted within the tenant.
 */
export interface Principal {
  tenantId: string;
  role: Role;
  userId?: string;
  email?: string;
  scopes?: string[]; // relationship ids a partner may access; undefined ⇒ unrestricted (client roles)
}

export const isClient = (p: Principal): boolean => p.role === 'client_admin' || p.role === 'client_ops';

/** Whether a principal may see a given relationship: client roles always; partners only if scoped. */
export const canSeeRelationship = (p: Principal, relationshipId: string): boolean =>
  isClient(p) || (p.scopes?.includes(relationshipId) ?? false);

/** Marks a route as not requiring authentication (e.g. login). */
export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Injects the resolved Principal into a handler. */
export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest<{ principal: Principal }>().principal;
});
