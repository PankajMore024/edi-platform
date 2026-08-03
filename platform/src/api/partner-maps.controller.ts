import { Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { PartnerMapRepository } from '../db/repositories/config-repositories';
import { EdiMap } from '../mapping/dsl/map.types';
import { Tenant } from './tenant.decorator';

/** Partner maps (X12 ⇄ canonical DSL) — referenced by relationship documents via mapId. */
@Controller('partner-maps')
export class PartnerMapsController {
  constructor(private readonly repo: PartnerMapRepository) {}

  @Get()
  list(@Tenant() tenantId: string) {
    return this.repo.list(tenantId);
  }

  @Get(':id')
  async get(@Tenant() tenantId: string, @Param('id') id: string): Promise<EdiMap> {
    const map = await this.repo.get(tenantId, id);
    if (!map) throw new NotFoundException(`partner map ${id} not found`);
    return map;
  }

  @Put(':id')
  async upsert(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: EdiMap): Promise<{ id: string }> {
    await this.repo.save(tenantId, id, body);
    return { id };
  }
}
