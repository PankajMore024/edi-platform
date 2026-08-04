import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, BadRequestException } from '@nestjs/common';
import { CertificationService } from './certification.service';
import { Tenant } from '../api/tenant.decorator';
import { CurrentPrincipal, Principal, canSeeRelationship, isClient } from '../api/principal';
import { Party } from '../control-plane/certification.types';

/**
 * Certification board API — session lifecycle, dropping a test file (→ validate → record), the bilateral
 * message thread, the event feed, and the certify gate. Authenticated to a Principal (API key = machine
 * client_admin; user token = console_user). RBAC: partners are scoped to their relationship and cannot
 * certify/waive/open/set-reference (client-only); they may view, drop files, and message.
 */
@Controller('certification')
export class CertificationController {
  constructor(private readonly svc: CertificationService) {}

  private assertClient(p: Principal): void {
    if (!isClient(p)) throw new ForbiddenException('this action is restricted to client operators');
  }
  private async assertSessionAccess(tenantId: string, p: Principal, sessionId: string): Promise<void> {
    if (isClient(p)) return;
    const relationshipId = await this.svc.relationshipForSession(tenantId, sessionId);
    if (!relationshipId) throw new NotFoundException(`certification session ${sessionId} not found`);
    if (!canSeeRelationship(p, relationshipId)) throw new ForbiddenException('outside your relationship scope');
  }
  private async assertDocAccess(tenantId: string, p: Principal, docId: string): Promise<void> {
    if (isClient(p)) return;
    const ref = await this.svc.sessionForDoc(tenantId, docId);
    if (!ref) throw new NotFoundException(`certification doc ${docId} not found`);
    if (!canSeeRelationship(p, ref.relationshipId)) throw new ForbiddenException('outside your relationship scope');
  }

  @Post('sessions')
  openSession(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Body() body: { relationshipId?: string }) {
    this.assertClient(p);
    if (!body?.relationshipId) throw new BadRequestException('relationshipId is required');
    return this.svc.openSession(tenantId, body.relationshipId);
  }

  @Get('sessions')
  async listSessions(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal) {
    const sessions = await this.svc.listSessions(tenantId);
    return isClient(p) ? sessions : sessions.filter((s) => canSeeRelationship(p, s.relationshipId));
  }

  @Get('sessions/:id')
  async getSession(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('id') id: string) {
    await this.assertSessionAccess(tenantId, p, id);
    return this.svc.getSessionDetail(tenantId, id);
  }

  @Get('sessions/:id/events')
  async events(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('id') id: string) {
    await this.assertSessionAccess(tenantId, p, id);
    return this.svc.listEvents(tenantId, id);
  }

  @Get('sessions/:id/messages')
  async messages(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('id') id: string) {
    await this.assertSessionAccess(tenantId, p, id);
    return this.svc.listMessages(tenantId, id);
  }

  @Post('sessions/:id/messages')
  async postMessage(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('id') id: string, @Body() body: { authorRole?: Party; authorUserId?: string; body?: string; certDocId?: string; relatedIssueId?: string }) {
    await this.assertSessionAccess(tenantId, p, id);
    if (!body?.authorRole || !body?.body) throw new BadRequestException('authorRole and body are required');
    return this.svc.addMessage(tenantId, id, { authorRole: body.authorRole, authorUserId: body.authorUserId ?? p.userId, body: body.body, certDocId: body.certDocId, relatedIssueId: body.relatedIssueId });
  }

  @Post('sessions/:id/certify')
  async certify(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('id') id: string, @Body() body: { certifiedBy?: string }) {
    this.assertClient(p);
    await this.assertSessionAccess(tenantId, p, id);
    const certifiedBy = body?.certifiedBy ?? p.email;
    if (!certifiedBy) throw new BadRequestException('certifiedBy is required');
    return this.svc.certify(tenantId, id, certifiedBy);
  }

  @Post('docs/:docId/reference')
  async setReference(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('docId') docId: string, @Body() body: { bytes?: string }) {
    this.assertClient(p);
    await this.assertDocAccess(tenantId, p, docId);
    if (!body?.bytes) throw new BadRequestException('bytes is required');
    return this.svc.setReference(tenantId, docId, body.bytes);
  }

  @Post('docs/:docId/files')
  async dropFile(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('docId') docId: string, @Body() body: { bytes?: string; uploadedBy?: Party }) {
    await this.assertDocAccess(tenantId, p, docId);
    if (!body?.bytes || !body?.uploadedBy) throw new BadRequestException('bytes and uploadedBy are required');
    return this.svc.dropFile(tenantId, docId, body.bytes, body.uploadedBy);
  }

  @Get('docs/:docId/files')
  async listFiles(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('docId') docId: string) {
    await this.assertDocAccess(tenantId, p, docId);
    return this.svc.listFiles(tenantId, docId);
  }

  @Post('docs/:docId/waive')
  async waive(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Param('docId') docId: string) {
    this.assertClient(p);
    await this.assertDocAccess(tenantId, p, docId);
    return this.svc.waive(tenantId, docId);
  }
}
