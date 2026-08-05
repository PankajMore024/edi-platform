import { randomUUID } from 'crypto';
import { Kysely } from 'kysely';
import { DB } from '../schema';
import { VendorPrefix } from '../../dropship/product-catalog.types';

export interface ShopifyRegistration {
  tenantId: string;
  shopDomain: string;
  secret: string;
  connectorInstanceId?: string;
  prefixes: VendorPrefix[];
}

/** Maps a Shopify shop domain → tenant + HMAC secret + routing prefixes. How a public (unauthenticated)
 * webhook resolves its tenant. Unique per shop domain. */
export class ShopifyRegistrationRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async upsert(r: ShopifyRegistration): Promise<void> {
    const row = {
      tenant_id: r.tenantId, shop_domain: r.shopDomain, secret: r.secret,
      connector_instance_id: r.connectorInstanceId ?? null, prefixes: JSON.stringify(r.prefixes ?? []),
    };
    await this.db.insertInto('shopify_registration')
      .values({ id: randomUUID(), created_at: new Date().toISOString(), ...row })
      .onConflict((oc) => oc.column('shop_domain').doUpdateSet(row))
      .execute();
  }

  async getByShop(shopDomain: string): Promise<ShopifyRegistration | undefined> {
    const r = await this.db.selectFrom('shopify_registration').selectAll().where('shop_domain', '=', shopDomain).executeTakeFirst();
    if (!r) return undefined;
    return { tenantId: r.tenant_id, shopDomain: r.shop_domain, secret: r.secret, connectorInstanceId: r.connector_instance_id ?? undefined, prefixes: JSON.parse(r.prefixes) as VendorPrefix[] };
  }
}
