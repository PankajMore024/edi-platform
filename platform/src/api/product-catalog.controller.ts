import { Body, Controller, Delete, ForbiddenException, Get, Post, Query, BadRequestException } from '@nestjs/common';
import { ProductCatalogRepository } from '../db/repositories/product-catalog.repository';
import { CatalogEntry } from '../dropship/product-catalog.types';
import { Tenant } from './tenant.decorator';
import { CurrentPrincipal, Principal, isClient } from './principal';

type EntryBody = Omit<CatalogEntry, 'tenantId'>;

/**
 * Product catalog (dropship SKU × vendor bindings — Shopify §4). Client operators manage it; partners
 * cannot. Bulk endpoint takes the parsed CSV rows the console uploads.
 */
@Controller('product-catalog')
export class ProductCatalogController {
  constructor(private readonly repo: ProductCatalogRepository) {}

  private assertClient(p: Principal): void {
    if (!isClient(p)) throw new ForbiddenException('managing the product catalog is restricted to client operators');
  }
  private valid(e: EntryBody): boolean {
    return !!(e && e.sellableSku && e.vendorId && e.vendorSku);
  }

  @Get()
  list(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal): Promise<CatalogEntry[]> {
    this.assertClient(p);
    return this.repo.list(tenantId);
  }

  @Post()
  async upsert(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Body() e: EntryBody): Promise<{ ok: true }> {
    this.assertClient(p);
    if (!this.valid(e)) throw new BadRequestException('sellableSku, vendorId, and vendorSku are required');
    await this.repo.upsert({ ...e, tenantId });
    return { ok: true };
  }

  @Post('bulk')
  async bulk(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Body() body: { entries?: EntryBody[] }): Promise<{ upserted: number; skipped: number }> {
    this.assertClient(p);
    const rows = (body?.entries ?? []).filter((e) => this.valid(e));
    const upserted = await this.repo.bulkUpsert(rows.map((e) => ({ ...e, tenantId })));
    return { upserted, skipped: (body?.entries?.length ?? 0) - upserted };
  }

  @Delete()
  async remove(@Tenant() tenantId: string, @CurrentPrincipal() p: Principal, @Query('sellableSku') sellableSku?: string, @Query('vendorId') vendorId?: string): Promise<{ deleted: boolean }> {
    this.assertClient(p);
    if (!sellableSku || !vendorId) throw new BadRequestException('sellableSku and vendorId are required');
    return { deleted: await this.repo.delete(tenantId, sellableSku, vendorId) };
  }
}
