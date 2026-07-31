# Target Architecture — Connector-Based, Bi-Directional EDI Platform

> **Architecture only — not an implementation plan.** This is a structure to revise,
> stress-test, and iterate until polished. No code, no framework commitments beyond
> what's noted as "current." Companion to `product-vision.md` (why),
> `mapping-design.md` (the map DSL), `saas-architecture-analysis.md` (platform-scale
> analysis), and `engine-structure.md`. Draft v1, 2026-07-28.

---

## 1. The load-bearing idea

**Everything is translation between three surfaces, through one canonical hub:**

```
      CUSTOMER-DATA SURFACE            CANONICAL HUB              PARTNER-EDI SURFACE
   (connectors: CSV/DB/API/       (business documents,        (X12 maps + envelope +
    Shopify/QuickBooks/…)          version-agnostic)            transport: SFTP/AS2/VAN)

        connector map  ◄──────────►   CANONICAL   ◄──────────►   partner (EDI) map
     "this source's shape           850/855/856/               "this partner's IG,
      ↔ canonical"                   810/846/997                 version, quirks"
```

- **Both edges are "map to/from canonical."** One edge speaks the customer's data shape
  (connector maps); the other speaks a partner's EDI dialect (partner maps). The engine in
  the middle is identical for both and for both directions. **This symmetry is the whole
  design** — it's why bi-directional + both-roles is *configuration*, not four products.
- **Partners and data sources are DATA, never code.** A new partner or a new customer feed
  = new map(s) + (maybe) a thin connector adapter. Never a fork of the engine.
- **Deterministic core, AI on the outskirts.** The translation path is pure, versioned, and
  golden-file testable. AI only drafts maps and drives the sandbox (see §7).

---

## 2. Direction & role model (what "bi-directional, both roles" means concretely)

The engine only ever performs four primitive translations. Every product scenario is a
composition of these:

| Primitive | From → To |
|---|---|
| **Ingest-EDI** | partner EDI → canonical |
| **Emit-EDI** | canonical → partner EDI |
| **Ingest-data** | customer source (connector) → canonical |
| **Emit-data** | canonical → customer source (connector) |

**Sell-side round trip** (customer is the supplier; big partner mandates EDI):
`Ingest-EDI(850)` → `Emit-data(order into Shopify/DB)` … then `Ingest-data(shipment/invoice)`
→ `Emit-EDI(855/856/810/997)`.

**Buy-side round trip** (customer is the buyer; today's engine):
`Ingest-data(PO)` → `Emit-EDI(850)` … then `Ingest-EDI(855/856/810/846)` → `Emit-data(...)`.

A **trading relationship** (tenant ↔ partner) is just config declaring which primitives run
for which document types, in which direction, over which transport, with which maps.

---

## 3. Layered architecture

Each layer is independently scalable and separately deployable. Additions vs the current
repo are marked **[NEW]**; things to harvest are marked **[HARVEST]**.

```
┌─ A. Partner Transport / Edge ─────────────────────────────────────────────┐
│ Protocol adapters: SFTP [HARVEST] · AS2 [NEW] · VAN [NEW] · HTTPS/API [NEW]│
│ Ingest → persist IMMUTABLE RAW artifact → emit "interchange received" event│
└───────────────────────────────────────────────────────────────────────────┘
┌─ B. Connector Layer  [NEW — our heaviest build, see §4] ──────────────────┐
│ Customer-side adapters ↔ canonical. Pre-built top connectors + SDK + spec. │
│ Ingest-data / Emit-data. Auth, scheduling, webhooks, file intake.          │
└───────────────────────────────────────────────────────────────────────────┘
┌─ C. Interchange / Envelope Service ───────────────────────────────────────┐
│ ISA/GS/ST parse+build [HARVEST: ediTemplateParser + kon_x12settings] ·     │
│ control-number mgmt · dedup/idempotency [NEW] · ack orchestration 997/TA1  │
└───────────────────────────────────────────────────────────────────────────┘
┌─ D. Translation / Mapping Engine (stateless, deterministic) ──────────────┐
│ canonical ⇄ X12 · version-aware · declarative map DSL + function library   │
│ [HARVEST domain logic from edi*Parser.js → declarative maps] · feeds node-x12│
└───────────────────────────────────────────────────────────────────────────┘
┌─ E. Canonical Document Model + Resource API ──────────────────────────────┐
│ per-doc (hierarchical for 856) · versioned · REST + webhooks · idempotency │
│ [HARVEST: docs/schema/canonical/* drafts]                                  │
└───────────────────────────────────────────────────────────────────────────┘
      supported by ↓ shared services
┌─ F. Registry: Maps · IGs · Connectors  [NEW] ─┐ ┌─ G. Reference Data [NEW] ─┐
│ effective-IG cascade (base→industry→partner→   │ │ code sets · cross-refs    │
│ relationship→tenant) · connector maps ·        │ │ (UOM/SCAC) · identities   │
│ SHARED TEMPLATE CATALOG · immutable versions   │ │ (GLN/DUNS/GTIN) · master  │
└────────────────────────────────────────────────┘ └───────────────────────────┘
┌─ H. Validation  [NEW] ────────────────────────┐ ┌─ I. Workflow/Orchestration┐
│ syntactic (vs IG) + business/compliance rules  │ │ doc lifecycle state machine│
│ → drives 997/824/scorecards                    │ │ retries · dead-letter · SLA│
└────────────────────────────────────────────────┘ └───────────────────────────┘
┌─ J. Sandbox / Certification Env [NEW, see §6] ─┐ ┌─ K. AI Services [NEW, §7] ─┐
│ isolated test env · golden files · test-data   │ │ onboarding (draft maps) ·  │
│ gen · cert report · promote→prod (immutable)   │ │ sandbox agent · triage     │
└────────────────────────────────────────────────┘ └───────────────────────────┘
┌─ L. Observability [NEW] ──────────────────────┐ ┌─ M. Tenant & Identity [NEW]┐
│ dashboards · audit trail · search · replay     │ │ multi-tenant · RBAC ·      │
└────────────────────────────────────────────────┘ │ secrets vault · isolation  │
                                                    └───────────────────────────┘
```

**Backbone:** a durable event stream (queue/Kafka) so every document is an event and the
whole pipeline is replayable. **Storage:** immutable raw artifacts (object store) · canonical
docs (DB/event store) · versioned config/metadata · append-only audit log · control-number store.

---

## 4. The Connector Layer — deep dive (the heaviest build)

This is the customer-facing edge and the biggest, most differentiating build. Treat it with
the same rigor as the partner-map layer: **connectors are mostly config + a thin adapter, not
bespoke apps.**

### 4.1 Anatomy of a connector

A connector is two parts:

1. **Adapter (thin code, implements the Connector SDK):** authentication, transport/trigger,
   and the raw I/O operations against the external system. This is the only code per
   connector, and it's small.
2. **Connector map (declarative, data):** the external system's native record shape ↔ the
   canonical document — the exact analogue of a partner EDI map, on the customer side.

A connector **declares** (its manifest):
- **Identity & auth** — credential type; secrets always in the vault (§8), never in config.
- **Direction(s)** — supports Ingest-data, Emit-data, or both.
- **Capabilities** — named operations it exposes (e.g. `fetchOrders`, `pushShipment`,
  `upsertInventory`, `createInvoice`).
- **Trigger model** — poll (schedule), webhook (push), file-drop (SFTP/upload), or manual.
- **Connector map(s)** — native shape ↔ canonical, per document type + direction.
- **Sandbox behavior** — how it runs against test data without touching the live system.

### 4.2 Connector taxonomy

| Class | How data moves | Examples |
|---|---|---|
| **File** | CSV/Excel/fixed-width via SFTP or upload | the universal fallback — every SMB can produce a file |
| **E-commerce/marketplace** | REST API + webhooks | Shopify, Amazon SP-API, Walmart Marketplace, WooCommerce, BigCommerce |
| **Accounting/ERP** | REST API | QuickBooks Online, NetSuite, Xero |
| **Database** | direct SQL / change-data-capture | customer's own DB/legacy app |
| **Generic** | configurable REST + webhook + field mapping | anything without a bespoke adapter yet — the escape hatch |

### 4.3 Recommended pre-built connectors shipped with prod (the "top few")

Minimal set that covers a real dropship SMB completely:

1. **Flat-file (CSV/Excel/fixed-width) over SFTP + upload** — universal safety net; nobody
   is ever blocked.
2. **Shopify** — dominant SMB storefront (orders, products, inventory, fulfillment).
3. **Amazon Seller (SP-API)** — dominant marketplace (orders, inventory, feeds).
4. **QuickBooks Online** — SMB accounting; the source/target for **810 invoices** and
   reconciliation.
5. **Generic REST/Webhook connector** — configurable escape hatch for custom apps/DBs and
   future systems without a bespoke build.

> Rationale: (1) guarantees no customer is blocked, (2)+(3) are the two channels dropship
> SMBs actually sell on, (4) is where invoices live, (5) removes "we don't support X" as a
> blocker. **Next tier (build on demand):** NetSuite, Walmart Marketplace API, WooCommerce,
> direct DB/SQL.

### 4.4 The symmetry payoff

Because a connector map and a partner EDI map both target the same canonical model, the
**same AI onboarding, the same sandbox/certification, the same versioning, and the same
template-catalog mechanics apply to both edges.** Build those capabilities once; they serve
connectors and partner maps alike.

---

## 5. Registry & the shared template catalog (the durable moat)

- **Effective-IG cascade** (from `saas-architecture-analysis.md`): `X12 base → industry
  profile → partner IG → trading-relationship → tenant`, sparse overrides, each versioned.
- **Connector maps** live in the same registry, versioned identically.
- **Shared template catalog:** curated, reusable partner maps ("Walmart DSV 850 v4010") and
  connector maps ("Shopify → canonical order"). A tenant **subscribes** to a template, then
  **overrides**. Seed it from the existing 60–70 vendor integrations — that seed is the
  cold-start advantage no SMB-focused competitor has.
- **Immutability:** published maps/IGs/connectors are immutable and **pinned per trading
  relationship**; template updates are **opt-in**, never auto-pushed into a live partner.

---

## 6. Sandbox / Certification environment

A first-class, isolated environment — not an afterthought — because partners require test
cycles and a bad map must never reach prod.

- **Isolation:** runs against test data only; connectors run in their sandbox mode (§4.1);
  no live partner transmission.
- **Inputs:** golden files (real, scrubbed samples) + AI-generated representative test data
  (§7).
- **Process:** run the candidate connector/partner map end-to-end → validate against the
  effective IG (syntactic) and business rules → diff against expected output → produce a
  **certification report** (pass/fail + diffs).
- **Promotion:** only a passing, human-approved version is **promoted to prod as an immutable
  published version** and pinned to the relationship. Golden-file regression runs on every
  future change to that map.

---

## 7. AI services — on the outskirts

Deterministic engine in the middle; AI at the edges as a **cost-structure weapon**:

- **Onboarding agent:**
  - *Partner side:* ingest IG (PDF) + EDI samples → draft partner map (canonical ↔ X12).
  - *Customer side:* ingest data samples / API schema → draft connector map.
  - Output is always a **draft for human review**, expressed in the declarative DSL.
- **Sandbox agent:** generate representative test transactions, run them, diff vs expected,
  surface failures, propose map fixes.
- **(Later) Compliance/anomaly + error-triage agents:** watch flows, flag likely chargeback
  conditions, diagnose rejects (824/997) and pre-draft fixes.

**Iron rule (unchanged):** AI *proposes*, deterministic engine *executes*, human *approves
promotion*. No arbitrary code in maps; no non-deterministic translation of live docs.

---

## 8. Cross-cutting: multi-tenancy, storage, security

- **Tenancy:** `tenant_id` on every row minimum; isolated workers/throughput limits for large
  tenants; consider schema/DB isolation for regulated ones.
- **Secrets:** per-tenant partner + connector credentials in a **secrets manager**, encrypted,
  never in config tables. *(Current repo stores partner creds in config — must change.)*
- **Retain raw bytes forever** — both received EDI **and** received customer files — for
  audit / chargeback disputes / legal. Non-negotiable.
- **Idempotency & control numbers** as first-class services (top source of prod incidents at
  scale).

---

## 9. What to harvest vs rebuild (relative to the current repo)

| Harvest (keep the knowledge) | Rebuild (change the structure) |
|---|---|
| Envelope config layer (`ediTemplateParser.js`, `kon_x12settings`) — already partner-agnostic | Hardcoded imperative `edi*Parser.js` → **generic map-driven engine** |
| Domain knowledge in the boolean flags (`is_td5`, `is_ctt`, `inc_vadd`…) → becomes **declarative map features** | Single-tenant assumptions → **multi-tenant** |
| Drafted canonical schemas (`docs/schema/canonical/*`) | SFTP-only → **pluggable transport + connector layer** |
| `node-x12` usage; the 60–70 real vendor maps → **seed the template catalog** | Buy-side-only flow → **symmetric bi-directional, both roles** |
| PHP coreapp callbacks | External coreapp coupling → **event-driven internal orchestration** |

---

## 10. Restructuring path (architecture altitude — sequence of capabilities, NOT code)

Deliberately staged so each step is provable before the next. This is *what to stand up in
what order*, not how to implement it.

- **Phase 0 — Freeze & harvest.** Treat the current engine as a reference. Extract the
  partner quirks (the boolean flags) into a knowledge table → future map features. No new code.
- **Phase 1 — Prove one pipe.** Canonical model + deterministic map engine for **one role,
  one round trip**: recommend **sell-side** for one design-partner retailer — `Ingest-EDI(850)`
  + `Emit-EDI(856/810/997)` — with **one connector (flat-file)** and **one partner map**,
  end-to-end, golden-file tested. This validates the whole three-surface thesis at minimum scope.
- **Phase 2 — Connector layer + sandbox + AI-assist.** Formalize the Connector SDK/spec; add
  2–3 top connectors (Shopify, Amazon, QuickBooks); stand up the sandbox/certification env;
  add the onboarding agent (draft maps).
- **Phase 3 — Second role + catalog + observability.** Add **buy-side** (harvest the current
  engine's maps); stand up the shared template catalog; add compliance validation + the
  observability/replay surface.

Each phase is independently demoable and independently sellable to a design partner.

---

## 11. Open questions to resolve as we iterate

- **Q1.** Canonical hierarchy for **856** (shipment→order→pack→item) — how deep to model now
  vs defer? (It's where variation and chargebacks cluster.)
- **Q2.** Connector map DSL — same DSL as partner maps, or a customer-side dialect? (Symmetry
  argues same; source shapes may need extra operators.)
- **Q3.** How much of the effective-IG cascade to build in Phase 1 vs a flat partner map that
  we refactor into the cascade later?
- **Q4.** Sandbox realism — how faithfully must connector sandbox modes mirror live systems
  (Shopify/Amazon test stores vs synthetic)?
- **Q5.** Runtime/stack — extend current Node, or the NestJS-module target in
  `engine-structure.md`? (Decide before Phase 1 code, not now.)
- **Q6.** Where does order/lifecycle **state** live now that the PHP coreapp is out —
  Workflow layer (I) owns it?
- **Q7.** First design-partner retailer program to target (Target Plus / Walmart DSV /
  Wayfair / …) — that choice fixes the first partner map + IG.
- **Q8.** **Inventory / Availability Orchestration service** (see
  `../strategy/operational-pain-analysis.md` §3) — a new event-driven component in the
  Reference Data (G) + Workflow (I) layers that owns a fast, single availability truth
  (vendor 846 feeds + marketplace + warehouse → fast push to channels), decoupling channel
  accuracy from the customer's slow ERP. When to introduce (recommended value-ladder Rung 2)?
- **Q9.** **OMS-lite** for ERP-less customers (QuickBooks + spreadsheets, no real system) —
  an optional lightweight inventory & order hub (NOT an ERP, NOT accounting/GL). Defer to
  Phase 3+; enter only deliberately (competes with Extensiv/Sellercloud). In or out of the
  long-term product?
- **Q10.** Emphasis rebalance: the operational-pain analysis argues orchestration
  (validation, availability, exceptions, visibility) is the durable value, not "Phase-3
  expansion." How much of layers H/I/L to bring forward into Phase 1–2 vs keep translation-first?
