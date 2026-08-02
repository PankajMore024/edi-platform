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
  list(@Tenant() tenantId: string, @Query('docType') docType?: string, @Query('state') state?: string) {
    return this.transactions.list(tenantId, { docType, state });
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
