import { Body, Controller, Get, NotFoundException, Param, Post, Put, BadRequestException } from '@nestjs/common';
import { ConnectorInstanceRepository } from '../db/repositories/connector-instance.repository';
import { ConnectorInstance } from '../connectors/connector.types';
import { profileSample, SampleProfile } from '../connectors/sample-profiler';
import { Tenant } from './tenant.decorator';

interface ImportSampleBody { type?: 'csv' | 'json'; sample?: string; docType?: string; }

/**
 * Client-system connector instances (the configured "how our data looks" bindings) + the sample-import
 * profiler that seeds a connector map from a real client sample.
 */
@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly repo: ConnectorInstanceRepository) {}

  @Get()
  list(@Tenant() tenantId: string) {
    return this.repo.listByTenant(tenantId);
  }

  /** Profile a client sample → detected fields + suggested canonical bindings (the console's import step). */
  @Post('import-sample')
  importSample(@Body() body: ImportSampleBody): SampleProfile {
    if (!body.sample || (body.type !== 'csv' && body.type !== 'json') || !body.docType) {
      throw new BadRequestException('import-sample requires { type: "csv"|"json", sample, docType }');
    }
    try {
      return profileSample({ type: body.type, sample: body.sample, docType: body.docType });
    } catch (e) {
      throw new BadRequestException(`could not profile sample: ${(e as Error).message}`);
    }
  }

  @Get(':id')
  async get(@Tenant() tenantId: string, @Param('id') id: string): Promise<ConnectorInstance> {
    const inst = await this.repo.get(tenantId, id);
    if (!inst) throw new NotFoundException(`connector instance ${id} not found`);
    return inst;
  }

  @Put(':id')
  async upsert(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: ConnectorInstance): Promise<ConnectorInstance> {
    const inst: ConnectorInstance = { ...body, id, tenantId };
    await this.repo.save(inst);
    return inst;
  }
}
