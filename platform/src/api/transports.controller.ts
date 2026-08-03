import { Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { TransportInstanceRepository } from '../db/repositories/config-repositories';
import { TransportInstance } from '../transport/transport.types';
import { Tenant } from './tenant.decorator';

/** Configured transport endpoints (SFTP/webhook instances) — how bytes move for a tenant. Credentials
 * resolve from the vault via vaultRef; only non-secret config is stored/returned. */
@Controller('transports')
export class TransportsController {
  constructor(private readonly repo: TransportInstanceRepository) {}

  @Get()
  list(@Tenant() tenantId: string): Promise<TransportInstance[]> {
    return this.repo.list(tenantId);
  }

  @Get(':id')
  async get(@Tenant() tenantId: string, @Param('id') id: string): Promise<TransportInstance> {
    const inst = await this.repo.get(tenantId, id);
    if (!inst) throw new NotFoundException(`transport instance ${id} not found`);
    return inst;
  }

  @Put(':id')
  async upsert(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: TransportInstance): Promise<TransportInstance> {
    const inst: TransportInstance = { ...body, id, tenantId };
    await this.repo.save(inst);
    return inst;
  }
}
