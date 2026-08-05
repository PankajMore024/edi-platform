import { Controller, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ShopifyWebhookService } from '../connectors/shopify/shopify-webhook.service';
import { ShopifyHmacError } from '../connectors/shopify/shopify-intake';
import { Public } from './principal';

/**
 * Public Shopify webhook receiver. Unauthenticated by API key (Shopify sends the shop domain + HMAC);
 * the service resolves the tenant from the shop and verifies the HMAC over the RAW body (app is created
 * with `rawBody: true`). Always answers 2xx quickly on success so Shopify doesn't retry.
 */
@Controller('webhooks')
export class ShopifyWebhookController {
  constructor(private readonly svc: ShopifyWebhookService) {}

  @Public()
  @Post('shopify')
  @HttpCode(200)
  async shopify(@Req() req: { rawBody?: Buffer; headers: Record<string, string | undefined> }) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    try {
      return await this.svc.process(rawBody, req.headers);
    } catch (e) {
      if (e instanceof ShopifyHmacError) throw new UnauthorizedException('invalid Shopify HMAC');
      throw e;
    }
  }
}
