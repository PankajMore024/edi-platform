# Connector Layer — Phase 2 architecture

> The customer-edge of the platform: how a customer's own systems (spreadsheet, API, DB, Shopify,
> QuickBooks…) feed the engine, the uniform interface connectors share with the engine, and how they
> appear in the admin console. Companion to `target-architecture.md` §4, `onboarding-and-config.md`,
> `admin-console.md`. Design only — not built yet. 2026-08-01.

## 1. Where connectors sit — two edges, one hub

Recall the four engine primitives. Connectors implement the **customer-side two**, mirroring how the
map engine implements the partner-side two:

```
   CUSTOMER SYSTEMS            CANONICAL HUB              PARTNER (X12)
  (Shopify/QBO/CSV/DB)                                   (Walmart/Target)
        │  Ingest-data  ┌──────────────────┐  Emit-EDI      │
        └──────────────►│    CANONICAL      │──────────────►│   (outbound: customer → partner)
                        │    document       │
        ◄──────────────┤ (850/855/856/…)  │◄──────────────┘
           Emit-data    └──────────────────┘   Ingest-EDI       (inbound: partner → customer)
        CONNECTORS                                MAP ENGINE
     (customer edge)                            (partner edge)
```

- **Partner edge** (built): the X12 map engine — `canonical ⇄ X12` (segment/element).
- **Customer edge** (Phase 2): connectors — `customer-native ⇄ canonical` (field/record).
- **They meet at canonical.** Connectors never touch the engine and vice versa.

## 2. The interface connectors share with the engine — it's the CANONICAL document

This is the crux: **connectors and the engine are fully decoupled and share exactly one contract —
the canonical document.** A connector exposes the same two operations regardless of its type:

```ts
interface Connector {
  descriptor: ConnectorDescriptor;                     // catalog metadata (console)
  ingestData(cfg: ConnectorInstance): CanonicalDocument[];   // customer system → canonical
  emitData(cfg: ConnectorInstance, docs: CanonicalDocument[]): void; // canonical → customer system
}
```

`ingestData` returns canonical (the engine's input); `emitData` consumes canonical (the engine's
output). The **TranslationPipeline composes them at the canonical boundary** — neither imports the
other:

- **Outbound** (customer → partner): `connector.ingestData() → CANONICAL → engine.emit() → X12`
- **Inbound** (partner → customer): `engine.ingest() → CANONICAL → connector.emitData()`

That's why the engine stayed pure: connectors plug in at canonical, orchestrated by the pipeline —
the same way maps and specs plug in. Connectors are just the **Ingest-data / Emit-data** primitives.

## 3. Connector types considered

Every connector is the same shape — **a thin adapter (transport + auth + trigger) + a declarative
connector-map** — differing only in the adapter. "Mostly config, not forks," like partner maps.

| Class | Examples | Adapter / auth | Trigger | Native shape |
|---|---|---|---|---|
| **File** | CSV / Excel / fixed-width | SFTP client or upload; SFTP creds | file-drop / poll / manual | rows × columns |
| **Generic API** | configurable REST + webhook | HTTP client + webhook endpoint; API key / OAuth | webhook (push) / poll | JSON payload |
| **E-commerce / marketplace** | Shopify, Amazon SP-API, Walmart, WooCommerce | vendor SDK; OAuth / token (SP-API: LWA + SigV4) | webhook / notifications / poll | order/product JSON |
| **Accounting / ERP** | QuickBooks Online, NetSuite, Business Central, Odoo | REST API; OAuth2 | poll / webhook | invoice/item/PO JSON |
| **Database** | direct SQL, change-data-capture | DB driver / CDC; DB creds | poll / CDC stream | table rows |

**v1 top-5 (ship first):** flat-file, generic REST/webhook, Shopify, Amazon SP-API, QuickBooks.
The first two are beachhead-independent; the platform one depends on the beachhead client type.

## 4. Anatomy of a connector

1. **Adapter (thin code, per connector):** authentication, transport, the raw I/O ops (`fetchOrders`,
   `pushInvoice`, `upsertInventory`, receive-webhook). The *only* code per connector, and it's small.
2. **Connector-map (declarative data):** the native shape ⇄ canonical field mapping — the
   customer-edge analogue of a partner map.
3. **Instance config (per tenant/relationship):** which connector, auth (→ **secrets vault**, never
   inline), endpoints/folders, trigger, connector-map, and which doc types it handles.

```ts
interface ConnectorInstance {
  id: string; tenantId: string;
  connectorType: string;                 // 'shopify' | 'flat-file' | 'quickbooks' | …
  auth: { vaultRef: string };            // creds resolved from the vault
  settings: Record<string, unknown>;     // host/folders/api base/etc.
  trigger: 'webhook' | 'poll' | 'file-drop' | 'manual';
  connectorMap: ConnectorMap;            // native ⇄ canonical
  docTypes: DocType[];
}
```

## 5. Connector-map vs partner (X12) map — sibling codecs, one hub

- The **X12 map** is segment/position based (`segment`, `pos`, `over`, `qualifier`) → RawSegments.
- The **connector-map** is field-path based (`sourcePath → canonicalPath`, with array/loop handling
  and the same modifiers: `when` / `default` / `format` / `decimal`). It's object-to-object, not
  segment-based.

They're **different DSLs but can share the operator library, and both target canonical.** That's the
"both edges are map-to-canonical" symmetry — so the connector-map benefits from the *same* validation,
sandbox, AI-drafting, and grid-review machinery we built/planned for partner maps.

## 6. Registry + config (console-ready, parallel to what exists)

- **`ConnectorRegistry`** — registers connector *types* with descriptors; `list()` → console palette.
  Exactly parallel to `MapRegistry` / `SpecRegistry`.
- **`ConnectorInstance`** — the configured connector for a relationship (declarative JSON, creds in
  vault). Lives in the config store next to `TradingRelationship`.
- The `TradingRelationship` gains a customer-edge binding: which connector instance feeds/consumes
  each doc. So a relationship fully describes both edges.

## 7. How connectors appear in the console

Connectors are first-class catalog components — the same treatment as maps/specs, plus a few
connector-specific surfaces:

- **Palette / library:** `ConnectorRegistry.list()` → draggable connector blocks (File, Shopify, QBO…).
- **Topology view:** the connector is the **customer-edge node** in the fixed relationship diagram
  (`customer system → [connector] → canonical → [partner map] → partner`). This is where the
  "visual/n8n-inspired" feel lives — but as a fixed 3-zone topology, not free wiring.
- **Instance config form:** auto-generated from the connector's config schema — endpoints, trigger,
  doc types. **Auth uses a guided flow** (OAuth for Shopify/QBO/Amazon, SFTP creds for file) that
  writes credentials to the **secrets vault** and stores only a `vaultRef` in config.
- **Connector-map editor:** the **same spreadsheet-style review grid** as the partner map (row per
  field: source → canonical), **AI-draftable from sample data**, validated live.
- **Observability:** per-connector status — last sync, throughput, errors, retries.

So the console renders a connector as: a palette entry + a topology node + an instance form (with
OAuth/secrets) + a map grid + a status panel — all driven by the declarative `ConnectorInstance`.

## 7a. Module structure (own module — core + per-connector plugins)

Connectors are a **separate module area**, not one blob:

```
platform/src/connectors/
  connectors.module.ts     CORE SDK: registry + object-mapper + types
  connector.types.ts       Connector interface · ConnectorInstance · ConnectorDescriptor
  connector-registry.ts    register connector TYPES; list() → console catalog
  object-mapper.ts         customer-edge codec (canonical ⇄ object/record); reuses mapping/ operators
  adapters/{flat-file,generic-rest,shopify,amazon,quickbooks}/   each its OWN module, self-registers
```

Rationale: **(1) dependency isolation** — a connector's heavy third-party SDK (aws-sdk, Shopify, QBO)
loads only when used; **(2) add/remove connectors without touching others** (plugin pattern);
**(3) microservice-extraction seam** — connectors are I/O/trigger-heavy with a different runtime
profile than the pure engine, so each is a natural future worker/service. Dependency direction:
`canonical`,`mapping` → `connectors/core` ← each adapter; `control-plane` → `connectors/core` (registry
only). The **TranslationPipeline depends on the ConnectorRegistry interface, never on concrete
connectors** — adapters self-register; the pipeline resolves by `connectorType` and calls
`ingestData()`/`emitData()`. The object-mapper reuses `mapping/`'s pure operators (path/predicate/
format/coerce) so the two codecs share one operator library.

## 7b. Flat-file: handling per-client variation (the customer-edge mirror of per-partner variation)

One generic flat-file adapter serves every client; per-client variation is **data**: a parse-config
+ a connector-map + reference tables. Flow: `raw file → (parse-config) → uniform Row[] →
(connector-map) → canonical`.

| Variable | Handled by | Shape |
|---|---|---|
| File type (CSV/Excel/fixed-width/TSV) | **parse-config** (adapter picks the parser) | `{type, delimiter, encoding, sheet, quoteChar}` |
| Headers / header row / none | **parse-config** | `{hasHeader, headerRow}`; else positional columns |
| Column names | **connector-map** | `source column → canonical path` |
| Column types (text → number/date) | **connector-map modifiers** (`decimal`/`format`) | reuses `coerce` |
| Unit conversions | **3 mechanisms** ↓ | — |

Unit conversion is three distinct problems (honest — this is the real work beyond parsing):
1. **UOM code normalization** (`CS`→`CA`) → a **code cross-reference table** (reference data), central,
   not inline per map.
2. **Scalar scaling** (cents→dollars, lb→kg) → a **`transform` operator** in the connector-map — a NEW
   declarative operator added to the shared operator library.
3. **Pack/qty conversion** (cases→eaches × per-SKU pack size) → an **enrichment lookup** into an
   **item master** + transform → needs the **reference/master-data subsystem**.

So flat-file completeness depends on: parse-config (easy) + connector-map with column→canonical +
coercion (easy) + **new `transform`/`lookup` operators + the reference-data subsystem** (the
non-trivial part). Renames/types/headers are pure config; value conversions needing the item master
are a real subsystem. AI onboarding infers parse-config + drafts the column map; the human declares
the conversions/cross-refs the AI can't infer without the item master.

## 7c. Edge-case catalogue (all connector types)

Most edge cases are cross-cutting; each class adds its own. **Per connector, exhaustive enumeration
+ golden/property tests + sandbox validation happen at build time** (quality charter) — the sandbox
with real sample data is what catches them before prod.

Cross-cutting (every connector): auth lifecycle (OAuth refresh/expiry/revoke); idempotency/dedup
(webhook retries + re-poll deliver duplicates); partial-batch failure (per-record errors, never drop);
missed-delivery reconciliation (backstop poll); rate limits/pagination/backoff; **schema drift**
(detect + fail loud, never silently mis-map); encoding/timezone; immutable raw retention.

Per class: **File** — leading-zero SKUs coerced to numbers, scientific-notation long numbers,
delimiters/newlines inside quoted cells, MM/DD vs DD/MM, multi-sheet, footer rows, ragged columns,
BOM. **API** — pagination, webhook signature verify, null-vs-absent, array-vs-single, versioning.
**E-commerce** — order edits/cancels/refunds post-creation, multi-currency, kits/bundles, SP-API
SigV4 + async feed polling, throttling. **ERP** — OAuth refresh, idempotent upsert, external-vs-entity
id, custom fields, two-way conflicts. **DB/CDC** — CDC lag/ordering, migrations, soft deletes, batching.

## 7d. Console mapping liberty (tiered — source-liberal, canonical-strict)

How much freedom the console gives for column→canonical mapping, tiered by user skill + field
complexity, with AI drafting the baseline:

| Tier | Who | Liberty | Guardrail |
|---|---|---|---|
| 0 AI draft | everyone | agent proposes full mapping from a sample | it's a draft — must be reviewed |
| 1 Grid point-and-click | operator | rebind column, set type, pick code cross-ref, mark required | can't target a non-existent canonical field; types validated |
| 2 Transform palette | operator | preset transforms (÷100, ×pack-lookup, trim, upper, concat, split) + params | fixed function library — NO free code |
| 3 DSL / expression | admin/advanced | edit connector-map / sandboxed expression for the custom 20% | declarative only; sandbox + validators must pass |

**Asymmetry:** liberty on the SOURCE (any column/transform/lookup); discipline on the CANONICAL
(fixed, governed schema — map INTO it, can't invent fields; one-offs → `extensions`). Keeps canonical
consistent across clients = the moat. **Always-on:** live shape+conformance validation, required-
canonical-field check, live preview (sample row → canonical), no save on validation failure.

## 8. Build scope (Phase 2)

- **Connector SDK / interface** (`Connector`, `ConnectorInstance`, `ConnectorRegistry`).
- **The object-mapper** (connector-map interpreter) — customer-edge codec to/from canonical.
- **Transport + lifecycle**: SFTP/API/webhook intake, immutable raw retention, doc lifecycle/retries,
  control-number/dedup wiring, 997 orchestration end-to-end.
- **The top-5 connectors** (adapters + default connector-maps).
- Everything registers into the control plane and is console-ready by construction.
