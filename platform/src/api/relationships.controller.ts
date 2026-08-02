import { Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { RelationshipRepository } from '../db/repositories/relationship.repository';
import { TradingRelationship } from '../control-plane/config.types';
import { Tenant } from './tenant.decorator';

/**
 * Provisioning of trading relationships — the central config object (client ↔ partner). Persists to the
 * durable RelationshipRepository. (M1: body is the TradingRelationship shape; strict DTO validation is
 * a follow-up.)
 */
@Controller('relationships')
export class RelationshipsController {
  constructor(private readonly repo: RelationshipRepository) {}

  @Get()
  list(@Tenant() tenantId: string): Promise<TradingRelationship[]> {
    return this.repo.listByTenant(tenantId);
  }

  @Get(':id')
  async get(@Tenant() tenantId: string, @Param('id') id: string): Promise<TradingRelationship> {
    const rel = await this.repo.get(tenantId, id);
    if (!rel) throw new NotFoundException(`relationship ${id} not found`);
    return rel;
  }

  @Put(':id')
  async upsert(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: TradingRelationship): Promise<TradingRelationship> {
    const rel: TradingRelationship = { ...body, id, tenantId }; // path + tenant are authoritative
    await this.repo.save(rel);
    return rel;
  }
}
