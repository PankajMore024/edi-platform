import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyRepository } from '../db/repositories/api-key.repository';
import { UserRepository } from '../db/repositories/user.repository';
import { Principal, PUBLIC_KEY } from './principal';

/**
 * Authenticates every request to a Principal and sets `req.principal` (+ `req.tenantId` for the legacy
 * `@Tenant()` decorator). Two credential kinds on `Authorization: Bearer <t>` / `x-api-key`:
 *   - an API key  → a machine principal, role `client_admin`, unrestricted within its tenant;
 *   - a user session token (`usr_…`) → the console_user's principal, carrying role + relationship scopes.
 * Routes marked `@Public()` (login) skip auth.
 */
@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeyRepository,
    private readonly users: UserRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; tenantId?: string; principal?: Principal }>();
    const auth = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-api-key'];
    if (!token) throw new UnauthorizedException('missing credentials');

    const principal = await this.resolve(token);
    if (!principal) throw new UnauthorizedException('invalid or revoked credentials');
    req.principal = principal;
    req.tenantId = principal.tenantId;
    return true;
  }

  private async resolve(token: string): Promise<Principal | undefined> {
    // User session tokens are prefixed `usr_`; anything else is tried as an API key first.
    if (token.startsWith('usr_')) {
      const p = await this.users.resolveSession(token);
      return p && { tenantId: p.tenantId, role: p.role, userId: p.userId, email: p.email, scopes: p.scopes };
    }
    const tenantId = await this.keys.resolve(token);
    return tenantId ? { tenantId, role: 'client_admin' } : undefined;
  }
}
