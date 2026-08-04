import { Body, Controller, Get, Param, Post, BadRequestException } from '@nestjs/common';
import { CertificationService } from './certification.service';
import { Tenant } from '../api/tenant.decorator';
import { Party } from '../control-plane/certification.types';

/**
 * Certification board API — session lifecycle, dropping a test file (→ validate → record), the bilateral
 * message thread, the event feed, and the certify gate. Tenant comes from the API key (global guard);
 * durable throughout (no cache). See docs/design/onboarding-certification.md.
 */
@Controller('certification')
export class CertificationController {
  constructor(private readonly svc: CertificationService) {}

  @Post('sessions')
  openSession(@Tenant() tenantId: string, @Body() body: { relationshipId?: string }) {
    if (!body?.relationshipId) throw new BadRequestException('relationshipId is required');
    return this.svc.openSession(tenantId, body.relationshipId);
  }

  @Get('sessions')
  listSessions(@Tenant() tenantId: string) {
    return this.svc.listSessions(tenantId);
  }

  @Get('sessions/:id')
  getSession(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.svc.getSessionDetail(tenantId, id);
  }

  @Get('sessions/:id/events')
  events(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.svc.listEvents(tenantId, id);
  }

  @Get('sessions/:id/messages')
  messages(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.svc.listMessages(tenantId, id);
  }

  @Post('sessions/:id/messages')
  postMessage(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: { authorRole?: Party; authorUserId?: string; body?: string; certDocId?: string; relatedIssueId?: string }) {
    if (!body?.authorRole || !body?.body) throw new BadRequestException('authorRole and body are required');
    return this.svc.addMessage(tenantId, id, { authorRole: body.authorRole, authorUserId: body.authorUserId, body: body.body, certDocId: body.certDocId, relatedIssueId: body.relatedIssueId });
  }

  @Post('sessions/:id/certify')
  certify(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: { certifiedBy?: string }) {
    if (!body?.certifiedBy) throw new BadRequestException('certifiedBy is required');
    return this.svc.certify(tenantId, id, body.certifiedBy);
  }

  @Post('docs/:docId/reference')
  setReference(@Tenant() tenantId: string, @Param('docId') docId: string, @Body() body: { bytes?: string }) {
    if (!body?.bytes) throw new BadRequestException('bytes is required');
    return this.svc.setReference(tenantId, docId, body.bytes);
  }

  @Post('docs/:docId/files')
  dropFile(@Tenant() tenantId: string, @Param('docId') docId: string, @Body() body: { bytes?: string; uploadedBy?: Party }) {
    if (!body?.bytes || !body?.uploadedBy) throw new BadRequestException('bytes and uploadedBy are required');
    return this.svc.dropFile(tenantId, docId, body.bytes, body.uploadedBy);
  }

  @Get('docs/:docId/files')
  listFiles(@Tenant() tenantId: string, @Param('docId') docId: string) {
    return this.svc.listFiles(tenantId, docId);
  }

  @Post('docs/:docId/waive')
  waive(@Tenant() tenantId: string, @Param('docId') docId: string) {
    return this.svc.waive(tenantId, docId);
  }
}
