import { Body, Controller, ForbiddenException, Get, Post, UnauthorizedException } from '@nestjs/common';
import { UserRepository } from '../db/repositories/user.repository';
import { CurrentPrincipal, Principal, Public, Role, isClient } from './principal';
import { Tenant } from './tenant.decorator';

const ROLES: Role[] = ['client_admin', 'client_ops', 'partner'];

/**
 * Console authentication + user provisioning. Login is public and returns a session token. Creating
 * users and scoping partners is a client_admin action (a client onboards its partner by creating a
 * `partner` login scoped to the relationship). See onboarding-certification.md §3.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly users: UserRepository) {}

  @Public()
  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    if (!body?.email || !body?.password) throw new UnauthorizedException('email and password are required');
    const res = await this.users.login(body.email, body.password);
    if (!res) throw new UnauthorizedException('invalid credentials');
    return { token: res.token, role: res.principal.role, tenantId: res.principal.tenantId, scopes: res.principal.scopes };
  }

  @Get('me')
  me(@CurrentPrincipal() principal: Principal) {
    return { role: principal.role, tenantId: principal.tenantId, userId: principal.userId, email: principal.email, scopes: principal.scopes ?? null };
  }

  @Post('logout')
  async logout(@Body() body: { token?: string }) {
    if (body?.token) await this.users.logout(body.token);
    return { ok: true };
  }

  /** client_admin creates a console user (optionally a scoped partner). */
  @Post('users')
  async createUser(@Tenant() tenantId: string, @CurrentPrincipal() principal: Principal, @Body() body: { email?: string; password?: string; role?: Role; scopes?: string[] }) {
    if (principal.role !== 'client_admin') throw new ForbiddenException('only client_admin can create users');
    if (!body?.email || !body?.password || !body?.role || !ROLES.includes(body.role)) {
      throw new ForbiddenException('email, password, and a valid role are required');
    }
    const user = await this.users.createUser({ tenantId, email: body.email, role: body.role, password: body.password });
    for (const relationshipId of body.scopes ?? []) await this.users.addScope(user.id, relationshipId);
    return { id: user.id, email: user.email, role: user.role };
  }

  /** client_admin scopes a partner user to another relationship. */
  @Post('users/scope')
  async addScope(@CurrentPrincipal() principal: Principal, @Body() body: { userId?: string; relationshipId?: string }) {
    if (principal.role !== 'client_admin') throw new ForbiddenException('only client_admin can scope users');
    if (!body?.userId || !body?.relationshipId) throw new ForbiddenException('userId and relationshipId are required');
    await this.users.addScope(body.userId, body.relationshipId);
    return { ok: true };
  }
}
