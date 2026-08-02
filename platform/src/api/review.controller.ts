import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ProcessingRepository } from '../db/repositories/processing.repository';
import { RelationshipRepository } from '../db/repositories/relationship.repository';
import { QuarantineResolver } from '../control-plane/quarantine-resolver';
import { Tenant } from './tenant.decorator';

interface ResolveBody { resolvedBy?: string; note?: string; }

/** The operator review queue (conflicts + rejects) and its resolution actions, over HTTP. */
@Controller('review')
export class ReviewController {
  constructor(
    private readonly ledger: ProcessingRepository,
    private readonly relationships: RelationshipRepository,
    private readonly resolver: QuarantineResolver,
  ) {}

  @Get()
  queue(@Tenant() tenantId: string) {
    return this.ledger.needingReview(tenantId);
  }

  @Post(':id/dismiss')
  dismiss(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: ResolveBody) {
    return this.resolver.dismiss(id, body.resolvedBy ?? 'unknown', body.note ?? '', new Date());
  }

  @Post(':id/reprocess')
  async reprocess(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: ResolveBody) {
    const event = await this.ledger.get(id);
    if (!event) throw new NotFoundException(`review event ${id} not found`);
    const rel = await this.relationships.get(tenantId, event.relationshipId);
    if (!rel) throw new NotFoundException(`relationship ${event.relationshipId} not found (needed to reprocess)`);
    return this.resolver.reprocess(rel, id, body.resolvedBy ?? 'unknown', body.note ?? '', new Date());
  }
}
