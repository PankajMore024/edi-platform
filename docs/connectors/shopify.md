# Shopify connector — spec

Status: **spec (2026-08-05), in build.** The first production-target connector. Bidirectional. This doc is
the source of truth for its micro-details; keep it updated as we build (A → B → transport → live cert).

Governing principles (from `docs/context.md`, memory): AI/adapters at the edges, **deterministic core**,
**money via decimal (never float)**, nothing silently dropped (unmapped → exception), tenant-scoped, durable.

---

## 1. Role & the two directions

Shopify is a **client-system connector** (the customer edge). It is **bidirectional**, and which end
Shopify sits on depends on the client's role in a given relationship:

- **Buy-side** — the client's Shopify store takes a *customer* order; we translate it to a canonical
  Order and emit an **850 PO out to the vendor(s)** who dropship. Shopify is the **source**.
  `Shopify order (webhook/API pull) → canonical Order → [split by vendor] → 850 out`
- **Sell-side** — a **partner sends an 850 to our client** (client is the supplier); we **create the order
  in the client's Shopify** to fulfill, then the Shopify fulfillment/refund events become **856 ASN / 810
  invoice** back to the partner. Shopify is the **destination**.
  `partner 850 (X12) → canonical Order → create Shopify order (Admin API)`
  `Shopify fulfillment → canonical → 856 out;  Shopify → 810 invoice out`

The **connector-map is shared and symmetric** — the same Shopify-order ⇄ canonical mapping powers both
directions (the engine's ingest/emit are inverses). Only the **transport action** differs (parse a webhook
vs `POST` an order).

**Confirmed decisions:** bidirectional; multi-vendor split (§5); SKU handling = prefix-convention default +
optional catalog (§4); sell-side = a template over a *standard* 850→order structure (§6); build order **A
then B** (§8).

---

## 2. Architecture — two axes, and what needs credentials

| Axis | Piece | Creds? |
|---|---|---|
| **Transport** | Webhook receiver (inbound push) + HMAC verify | **no** — deterministic, testable |
| | Admin API client (pull orders; push order/fulfillment/inventory) | **yes** — live store/token |
| **Translation** | Shopify order JSON ⇄ canonical (ObjectMapper + connector-map + Shopify normalizer) | **no** — public payloads |
| | SKU cross-ref / multi-vendor split (§4, §5) | **no** |

**Honest split:** the translation + webhook verification + edge-case handling (~75%) are production-grade
and fully testable from public sample payloads, **no creds**. The live Admin API round-trips (OAuth/token,
create-order, fulfillment, inventory) are **written to spec + unit-tested against mocked responses**, but
only *validated* against a **free Shopify Partner dev store** (custom-app admin token — no OAuth dance).
Until that live pass, transport is labeled "mock-tested," never "proven."

---

## 3. Shopify Order — the payload we map (Admin API `Order` / `orders/create` webhook)

Key fields (Admin REST `2024-10`; webhook payload is the same shape). Money is **decimal strings**
(`"19.99"`), quantities are integers. Multi-currency via `*_set` objects (`shop_money` vs
`presentment_money`).

| Shopify field | Notes |
|---|---|
| `id`, `admin_graphql_api_id` | Shopify order id (idempotency, back-reference) |
| `name` (`"#1001"`), `order_number` | human PO reference |
| `created_at`, `processed_at`, `updated_at`, `cancelled_at` | dates |
| `currency`, `presentment_currency` | use `shop_money` amounts for the reseller's books |
| `financial_status` | pending/paid/partially_refunded/refunded/voided |
| `fulfillment_status` | null/partial/fulfilled/restocked |
| `test` (bool), `source_name` | **skip `test:true` unless explicitly allowed** |
| `total_price`, `subtotal_price`, `total_tax`, `total_discounts`, `total_shipping_price_set` | money |
| `line_items[]` | `id`, `sku`, `variant_id`, `product_id`, `title`, `variant_title`, `quantity`, `fulfillable_quantity`, `price`, `price_set`, `grams`, `vendor`, `requires_shipping`, `properties[]`, `discount_allocations[]` |
| `shipping_address` | `name`, `company`, `address1/2`, `city`, `province[_code]`, `country[_code]`, `zip`, `phone` → **N1\*ST ship-to** (dropship: vendor ships to customer) |
| `billing_address` | → N1\*BT |
| `customer` | `id`, `email`, name |
| `shipping_lines[]` | carrier/service + price |
| `note`, `note_attributes[]`, `tags` | free-form; can carry routing hints |

### Mapping → canonical Order (buy-side ingest)

| Canonical (`Order850`) | From |
|---|---|
| `poNumber` | `name`/`order_number` (configurable) |
| `poDate` | `processed_at` \|\| `created_at` (→ ISO) |
| `parties[ST]` | `shipping_address` |
| `parties[BT]` | `billing_address` |
| `lineItems[].sku` | `line_items[].sku` **→ SKU cross-ref (§4)** |
| `lineItems[].quantity.value` | `line_items[].quantity` (uom EA unless catalog pack/uom) |
| `lineItems[].unitPrice.amount` | `line_items[].price` (decimal) |
| `lineItems[].ids[]` | variant/product id, upc if present |
| `references` | Shopify order id, `note_attributes` |
| `totalAmount` | `total_price` (reconciled to line sum ± tax/shipping) |

The generic ObjectMapper handles most of this via the connector-map; a thin **Shopify normalizer** handles
what a declarative map can't: nested address → party, SKU fallback (`sku` → `variant.sku` → skip/flag),
`_set` currency selection, and `test`-order skipping.

---

## 4. SKU cross-reference — two strategies (both supported)

The sellable SKU on the order is **not** the vendor's part number. Two resolution strategies, tried in order:

1. **Catalog table (opt-in, robust)** — takes precedence when a row exists. One row per *sellable SKU ×
   vendor binding*:

   | tenant_id | sellable_sku | relationship_id (vendor) | vendor_sku | pack_size | uom | priority | active |
   |---|---|---|---|---|---|---|---|
   | demo | WIDGET-BLUE | Ridgeline | RDG-4471 | 12 | CA | 1 | ✓ |
   | demo | WIDGET-BLUE | Summit | SMT-BLU | 1 | EA | 2 | ✓ |

   Drives **routing** (which vendor → the split, §5), **translation** (sellable→vendor SKU), and
   **pack/UOM** conversion (reuse existing `crossref`/`multiplyByLookup` transform ops). Populated by
   **CSV upload / product-feed import** in a console screen; bidirectional per partner (their SKU ↔ ours
   for sell-side).

2. **Prefix convention (default, runtime, no table)** — the common reseller case: the sellable SKU is the
   vendor SKU with the reseller's prefix prepended. Configured **per relationship** as a `skuPrefix`
   (e.g. Ridgeline → `RDG-`). At runtime: a SKU starting with a vendor's prefix **routes to that vendor**
   and the prefix is **stripped** to yield the vendor SKU. Handles split + translation with zero data.
   - New transform ops: `stripPrefix{prefix}` (sellable→vendor) and its inverse `addPrefix{prefix}`
     (vendor→sellable, for sell-side / re-emit).
   - Nuance recorded: prefix-strip alone gives the vendor SKU; **routing** needs the prefix to identify the
     vendor — so prefixes are configured **per vendor** (prefix ⇒ vendor). Ambiguous/overlapping prefixes
     or no match → fall through to catalog, else exception.

**Resolution order:** catalog row → per-vendor prefix match → **unmapped ⇒ exception** (a line whose SKU
resolves to no vendor holds the order in the review queue; never silently emit a PO with an unknown item).

Reuse: the engine already has `ReferenceDataStore` + `crossref`/`multiplyByLookup` transform ops (in-memory
today). Productionizing = a durable `product_catalog` table + a loader (like `ConfigLoader`) + the two new
prefix ops + the exception path.

---

## 5. Multi-vendor split

One Shopify order → resolve each line's vendor (§4) → **group lines by vendor → emit one 850 per vendor**.
The SKU→vendor resolution *is* the splitter (no separate machinery). Cases to test: single-vendor (one
850); N vendors (N 850s, each with its vendor's SKUs/pack/uom); a line eligible for 2 vendors
(priority/availability picks one); an unmapped line (whole order → exception until resolved). Each split
850 carries the same ship-to (the customer) and a back-reference to the Shopify order id.

---

## 6. Sell-side — 850 → Shopify order (template)

Per decision: build a **template assuming a standard 850 → order structure** (not every partner variant).
`canonical Order (from partner 850) → Shopify order create`:

| Shopify order (create body) | From canonical |
|---|---|
| `line_items[].sku` / `variant_id` | line SKU (reverse cross-ref: vendor/partner SKU → our sellable SKU via prefix `addPrefix` or catalog) |
| `line_items[].quantity` / `price` | line qty / unitPrice |
| `line_items[].title` | product title (fallback when no variant match) |
| `shipping_address` | ship-to party |
| `customer.email` | order email |
| `note_attributes[PO]`, `tags` | partner PO number, EDI source |
| `financial_status: 'pending'` | draft/unpaid (EDI order, not a storefront sale) |

Creation via **Draft Order** (`POST /draft_orders.json` → complete) is preferred for EDI-driven orders
(no payment capture, controllable inventory), with plain `POST /orders.json` as an alternative. The
**body construction is creds-free/testable**; the actual `POST` is creds-gated (§7). Fulfillment/refund
events → 856/810 are a later increment (API pull/webhook).

---

## 7. Transport & auth

**Webhook (inbound, creds-free to verify):**
- Verify `X-Shopify-Hmac-SHA256` = `base64(HMAC_SHA256(rawBody, apiSecret))` over the **raw** body (before
  JSON parse). Reject on mismatch.
- Headers: `X-Shopify-Topic`, `X-Shopify-Shop-Domain`, `X-Shopify-API-Version`, `X-Shopify-Webhook-Id`
  (idempotency), `X-Shopify-Triggered-At`.
- Topics: `orders/create`, `orders/updated`, `orders/cancelled`, (later) `fulfillments/create`,
  `refunds/create`.
- **Idempotency:** dedupe on `X-Shopify-Webhook-Id` / order `id`+`updated_at` via the existing dedup layer
  (Shopify re-delivers on non-2xx and occasionally duplicates).

**Admin API (creds-gated):**
- Auth: **custom-app admin API access token** (`shpat_…`) per store — no OAuth dance; simplest for one
  store per client. OAuth (public app) documented as the multi-store alternative. Token in the **vault**
  (`vaultRef`), never in config.
- Version pinned (e.g. `2024-10`). Rate limits: REST leaky bucket — honor `X-Shopify-Shop-Api-Call-Limit`
  and `Retry-After` (429) with backoff. Pagination: cursor via `Link: rel="next"`.
- Operations: pull orders (buy-side alt to webhook), create order/draft (sell-side), create fulfillment
  (856 → Shopify), set inventory level (846 → Shopify).

This maps onto the platform's existing **transport axis** (the `WebhookTransport` stub already has a
`receive()` + signature hook; a `ShopifyApiTransport`/adapter is new). Live pull/push stay behind
`TransportNotConfiguredError` until a store/token exists.

---

## 8. Edge cases (test matrix)

Covered as fixtures + unit/golden/property tests (creds-free) unless marked live:

- **Line items:** no SKU (custom/digital) → skip+flag or exception; `variant.sku` fallback; zero/negative
  qty; `fulfillable_quantity` < `quantity` (partial); very long titles.
- **Routing:** single vendor; multi-vendor split; line eligible for ≥2 vendors (priority); unmapped SKU →
  exception; prefix vs catalog precedence.
- **Money:** decimal strings; multi-currency (`shop_money` vs `presentment_money`); discounts; taxes;
  shipping lines; total reconciliation (line sum + tax + shipping vs `total_price`).
- **Addresses:** missing shipping (digital) ; international (province/country codes); PO-box; company vs person.
- **Order state:** `test:true` (skip); cancelled/refunded (separate topics → 856/810 reversal semantics);
  draft orders; partially fulfilled.
- **Webhooks:** bad HMAC (reject); duplicate/replayed (idempotent); out-of-order `orders/updated` before
  `orders/create`; oversized payload; wrong topic.
- **API (live):** 429 backoff; cursor pagination; API-version drift; token revoked/invalid.

---

## 9. Phased build plan

- **A — SKU / reference engine + multi-vendor split** *(creds-free, fully tested).* Durable
  `product_catalog` table + loader; `stripPrefix`/`addPrefix` transform ops; resolution order (catalog →
  prefix → exception); the split; the unmapped-exception path; CSV-import + management console screen.
  This is the dropship routing core and a prerequisite for a *correct* connector.
- **B — Shopify translation + webhook ingest** *(creds-free, fully tested).* Real Shopify order fixtures →
  canonical (buy-side) with the Shopify normalizer; the sell-side 850→order template; HMAC verify +
  idempotency + topic routing wired to intake. Golden + property tests over the §8 matrix.
- **C — Admin API client** *(written + mock-tested).* create-order/draft, fulfillment, inventory, pull;
  versioning, rate-limit backoff, pagination, retry; vault token.
- **D — Live certification** *(free Shopify dev store).* Register webhooks, real round-trips, reconcile;
  flip transport from "mock-tested" to "proven."

A+B are the honest "prod-ready, tested, no creds" deliverable. C is prod code, mock-validated. D is sign-off.

---

## 10. Status

| Piece | State |
|---|---|
| This spec | ✅ written |
| A — SKU engine + split | ✅ built: `src/dropship/` (`SkuResolver` catalog→prefix→unmapped; `OrderRouter` split + translate + pack/uom); durable `product_catalog` + repo; **management API** (`/product-catalog`, client-only) + **console screen** (Resources → Product catalog: add/delete + CSV import); seeded demo bindings. Tests: 10 engine/repo + 1 e2e. **Applying the router on 850 emit + unmapped→exception lands in B** (needs the Shopify canonical source). |
| B — translation + webhook | ✅ built: `src/connectors/shopify/` — order⇄canonical adapter, webhook HMAC verify+parse, `ShopifyIntake` (verify→canonical→split→held), sell-side create template. 10 tests over the §8 matrix. **Remaining → C:** the HTTP webhook receiver endpoint + shop-domain→tenant/connector routing + wiring `routed`/`unmapped` into the outbound emit & review queue. |
| C — Admin API client | ⬜ (mock) |
| D — live cert (dev store) | ⬜ (needs a free dev store) |

---

## 11. Implementation notes (as built)

**A — dropship SKU engine** (`src/dropship/`): `product-catalog.types.ts`, `sku-resolver.ts`
(catalog→prefix→unmapped), `order-router.ts` (split + translate + pack/uom). Durable
`product_catalog` table + `ProductCatalogRepository` (`buildResolver` loads a tenant's catalog + prefixes
into a `SkuResolver`). Management: `/product-catalog` API (client-only) + console **Resources → Product
catalog** (add/delete + CSV import). Seeded demo bindings.

**B — Shopify translation + webhook** (`src/connectors/shopify/`):
- `shopify.types.ts` — the consumed subset of the Admin `Order` payload (money as decimal strings, `*_set`
  currency).
- `shopify-order.adapter.ts` — `shopifyOrderToCanonical(order, {poNumberFrom, currency})` (buy-side) +
  `canonicalToShopifyOrder(order)` (sell-side template). Decimal money; `shop`/`presentment` currency
  selection; address→party (role `ST`/`BT` — X12-code shortcut, see note in-file); SKU fallback → empty
  `ids` when absent (so the router holds it); `isTestOrder`.
- `shopify-webhook.ts` — `verifyShopifyHmac(rawBody, header, secret)` (constant-time, over the RAW body) +
  `parseShopifyWebhook(headers, body)`.
- `shopify-intake.ts` — `ShopifyIntake.ingest(rawBody, headers, secret, resolver, opts)`:
  **verify HMAC → parse → skip `test` orders → map to canonical → split by vendor** → `{ idempotencyKey,
  canonical, routed[], unmapped[], held }`. `held` (unmapped SKU) means do-not-emit. Pure/deterministic
  given the resolver.

**Tested (creds-free), §8 matrix covered:** header/party/line mapping; multi-currency; no-SKU → held;
test-order skip; HMAC valid/wrong-secret/tampered/missing; webhook parse; multi-vendor split + prefix
strip; sell-side create body. **Not yet (→ C, needs plumbing/creds):** the HTTP `POST /webhooks/shopify`
receiver, shop-domain→tenant resolution, feeding `routed` into the 850 emit/dispatch, `unmapped`→review
queue exception, and all live Admin API calls.

Seeded `shopify-webstore` connector today is an **illustrative stub** (a hand-written connector-map) — not
this connector. It'll be replaced as A/B land.
