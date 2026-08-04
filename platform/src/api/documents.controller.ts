import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { TransactionRepository } from '../db/repositories/transaction.repository';
import { ProcessingRepository } from '../db/repositories/processing.repository';
import { Tenant } from './tenant.decorator';

/**
 * Read model for the console's Documents / lifecycle views — served from the normalized transaction
 * rows (no blob), with the per-document lifecycle timeline from the processing ledger.
 */
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly ledger: ProcessingRepository,
  ) {}

  @Get()
  async list(
    @Tenant() tenantId: string,
    @Query('docType') docType?: string,
    @Query('state') state?: string,
    @Query('relationshipId') relationshipId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const lim = limit != null ? Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200) : undefined;
    const off = offset != null ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    const { items, total } = await this.transactions.list(tenantId, { docType, state, relationshipId, limit: lim, offset: off });
    return { items, total, limit: lim ?? total, offset: off };
  }

  @Get(':id')
  async get(@Tenant() tenantId: string, @Param('id') id: string) {
    const txn = await this.transactions.get(tenantId, id);
    if (!txn) throw new NotFoundException(`transaction ${id} not found`);
    return txn;
  }

  /** The lifecycle timeline for one interchange identity (retention → validate → deliver → 997). */
  @Get('timeline/:dedupKey')
  timeline(@Tenant() tenantId: string, @Param('dedupKey') dedupKey: string) {
    return this.ledger.timeline(tenantId, decodeURIComponent(dedupKey));
  }
}
