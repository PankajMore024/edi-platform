import { Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { DocSpecRepository } from '../db/repositories/config-repositories';
import { DocSpec } from '../validation/spec.types';
import { Tenant } from './tenant.decorator';

/** Conformance specs / IGs (house or partner) — referenced by relationship documents via specId. */
@Controller('specs')
export class SpecsController {
  constructor(private readonly repo: DocSpecRepository) {}

  @Get()
  list(@Tenant() tenantId: string) {
    return this.repo.list(tenantId);
  }

  @Get(':id')
  async get(@Tenant() tenantId: string, @Param('id') id: string): Promise<DocSpec> {
    const spec = await this.repo.get(tenantId, id);
    if (!spec) throw new NotFoundException(`spec ${id} not found`);
    return spec;
  }

  @Put(':id')
  async upsert(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: DocSpec): Promise<{ id: string }> {
    await this.repo.save(tenantId, id, body);
    return { id };
  }
}
