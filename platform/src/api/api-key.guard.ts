import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeyRepository } from '../db/repositories/api-key.repository';

/**
 * Establishes the request's tenant from an API key (`Authorization: Bearer <key>` or `x-api-key`), so
 * the tenant is authenticated, not spoofable via a header. Sets `req.tenantId` for the `@Tenant()`
 * decorator. Applied globally to the API. (User-level auth / roles are a later concern.)
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; tenantId?: string }>();
    const auth = req.headers['authorization'];
    const key = auth?.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-api-key'];
    if (!key) throw new UnauthorizedException('missing API key');
    const tenantId = await this.keys.resolve(key);
    if (!tenantId) throw new UnauthorizedException('invalid or revoked API key');
    req.tenantId = tenantId;
    return true;
  }
}
