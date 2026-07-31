# Architecture Overview — the whole app, simply

> One page to understand the entire system: the engine, bidirectional flow, mappings, versions,
> doc types, shared services, DB schema, connectors, and the phases. Plain language.
> Consolidates the detail docs. 2026-07-31.

---

## 1. What the app does (in one breath)

It **translates business documents** between two worlds that speak different languages:

- the **customer's world** (Shopify, QuickBooks, a CSV, their DB) — where our customer lives, and
- the **partner's world** (Walmart, Target, a big vendor) — which demands **EDI (X12)**.

In the middle sits a **universal format we invented — the "canonical" document.** Everything
translates *to* and *from* canonical. That one idea makes everything else simple.

```
   CUSTOMER'S WORLD                    OUR PLATFORM                         PARTNER'S WORLD
  (Shopify, QuickBooks,        ┌──────────────────────────────┐        (Walmart, Target, vendors)
   CSV, their DB/ERP)          │        CANONICAL HUB          │
      │   ▲                    │   850 855 856 810 846 997     │            │   ▲
      ▼   │   connector maps   │        ▲          ▲           │ partner maps ▼  │
  ┌───────────┐ ◄────────────► │    INGEST        EMIT         │ ◄──────────► ┌───────────┐
  │ CONNECTORS│                │  (→ canonical) (canonical →)  │              │ X12 CODEC │
  │ (customer │                │   deterministic engine        │              │ +ENVELOPE │
  │   edge)   │                └──────────────────────────────┘              │ (partner  │
  └───────────┘                                                               │   edge)   │
                      SHARED SERVICES underneath everything:                  └───────────┘
   registry(maps) · reference data(codes/SKU) · control numbers · secrets vault · raw store ·
   validation · workflow/lifecycle · observability · tenancy/RBAC · sandbox + agentic AI onboarding
```

**The golden rule:** partners, versions, and formats are **DATA (config), never code.** The engine
never changes to add a partner — you add a map.

---

## 2. The EDI engine & bidirectional flow

The engine does only **four tiny jobs** ("primitives"). Everything the product does is a
combination of these four:

| Primitive | Direction |
|---|---|
| **Ingest-EDI** | partner X12 → canonical |
| **Emit-EDI** | canonical → partner X12 |
| **Ingest-data** | customer system → canonical (via a connector) |
| **Emit-data** | canonical → customer system (via a connector) |

Because the engine is symmetric, **which "seat" the customer is in is just configuration:**

**Sell-side** (customer is a *supplier*; the big partner mandates EDI — our wedge):
```
partner 850 (PO) ──Ingest-EDI──► CANONICAL ──Emit-data──► customer (Shopify/DB)
customer ships/invoices ──Ingest-data──► CANONICAL ──Emit-EDI──► 855 / 856 / 810 / 997 to partner
```

**Buy-side** (customer is a *buyer* of their own vendors — what the old engine did):
```
customer PO ──Ingest-data──► CANONICAL ──Emit-EDI──► 850 to vendor
vendor 855/856/810/846 ──Ingest-EDI──► CANONICAL ──Emit-data──► customer
```

Same engine, opposite wiring. That's why "bidirectional + both roles" is *four primitives*, not
four products.

---

## 3. Mappings (the heart of it)

A **map** is a small declarative file that says *"this field over here = that position over there."*
Two kinds, both translating to/from the same canonical hub:

- **Partner (EDI) map** — canonical ↔ a partner's X12 (their quirks, qualifiers, version).
- **Connector map** — canonical ↔ a customer system's shape (Shopify order, a CSV column layout).

Both are written in the **same DSL** (`platform/src/mapping/dsl/map.types.ts`, validated by
`docs/schema/edi-map.schema.json`). The engine *interprets* maps; it has **zero partner logic
baked in.** Onboarding a new partner = **a new map**, reviewed and tested, never a code change.

That single principle is the moat: all the messy per-partner variation that used to be `if/else`
branches and boolean columns (`is_td5`, `inc_vadd`…) becomes **data in a map.**

---

## 4. Version handling (X12 4010 vs 5010 vs …)

- The **engine is version-neutral** — it never branches on version.
- **Version is just structural variation the map absorbs** — handled exactly like partner quirks.
- Version plays **3 roles**: (1) **selector** — pick the map by `(partner, docType, direction,
  version)`; read from GS08 inbound, from config outbound; (2) **envelope value** — stamped in
  GS08; (3) **validation key** — pick the right per-version X12 dictionary (reference data; later).
- **v1:** target **4010** (dominant in retail/dropship); add versions per real partner demand —
  each new version is a new map, never engine work. *(Full detail: decision D37.)*

---

## 5. EDI document types (v1 set)

All six are "just canonical documents + maps." They form the dropship order-to-cash loop:

| Doc | Name | Who sends (sell-side) | Meaning |
|---|---|---|---|
| **850** | Purchase Order | partner → customer | "Here's an order." |
| **855** | PO Acknowledgment | customer → partner | "Got it / accepted/changed." |
| **856** | ASN (ship notice) | customer → partner | "It shipped — here's what/how." |
| **810** | Invoice | customer → partner | "Here's the bill." |
| **846** | Inventory/Price Advice | customer/vendor | "Here's current stock & price." (feeds inventory) |
| **997** | Functional Ack | both ways | "I received your EDI file." (technical receipt) |

Each is one canonical shape (per doc type) + one map per (partner, direction, version).

---

## 6. Centralized / shared services

The cross-cutting services every document flow leans on (built progressively — see §9):

| Service | Plain-English job | Phase |
|---|---|---|
| **Registry** | Stores & versions all maps + configs; the shared **template catalog** (the moat). | 1→ |
| **Reference data** | Code cross-references (partner UOM/SCAC ↔ canonical), SKU/UPC/GTIN identity. | 3→ |
| **Control numbers** | Hands out unique ISA13/GS06/ST02, prevents duplicates. | 2 |
| **Secrets vault** | Holds partner/connector credentials — encrypted, never in config tables. | 1 |
| **Raw store** | Keeps every received & sent file **byte-for-byte, forever** (audit/disputes). | 2 |
| **Validation** | Checks a doc is correct — syntactic (vs IG) + business rules (chargebacks). | 3→4 |
| **Workflow / lifecycle** | Tracks each document's state; retries; dead-letters failures. | 2→ |
| **Observability** | Dashboards, search, replay — the control tower. | 5 |
| **Tenancy / RBAC** | Keeps each customer's data isolated; who-can-do-what. | 1 |
| **Sandbox + AI onboarding** | Test maps against real samples; the agent drafts maps in a loop. | 3 |

---

## 7. Connectors layer (the customer edge)

Connectors are how the customer keeps their own tools while we do EDI. A connector = **a thin
adapter (auth + I/O) + a connector map (to canonical).** New connectors are mostly config, not
forks — the mirror image of partner maps.

**Types & the top few we ship first:**

| Class | Examples | Ship in v1? |
|---|---|---|
| **File** | CSV/Excel via SFTP or upload | ✅ (universal safety net) |
| **Generic API** | configurable REST + webhook | ✅ (escape hatch for anything) |
| **E-commerce/marketplace** | Shopify, Amazon SP-API, Walmart, WooCommerce | ✅ **one** (Shopify *or* the beachhead's system) |
| **Accounting/ERP** | QuickBooks, NetSuite, Business Central, Odoo | later (per client) |
| **Database** | direct SQL / CDC | later |

Note: some *partners* (Amazon, Target+) are API-based, so the connector layer also serves that
"partner" side — not everything on the partner edge is X12.

---

## 8. Database schema (proposed)

Multi-tenant from day one (`tenant_id` everywhere), config-as-data, immutable raw & published maps.
Grouped by concern; **★ = v1 core**, the rest arrive with their phase.

**Tenancy & identity**
- ★ `tenant` — the customer org. *(harvest: old `client`)*
- ★ `user`, ★ `role` — login + RBAC, scoped to tenant.

**Trading setup (config)**
- ★ `trading_partner` — a partner/retailer/vendor a tenant trades with.
- ★ `trading_relationship` — tenant ↔ partner: which docs, directions, version, active. *(the "who
  plays which role" config)*
- ★ `envelope_config` — ISA/GS settings per relationship. *(harvest: `kon_x12settings` envelope fields)*
- ★ `connection` — transport (SFTP/API/AS2) settings; credentials point to the **vault**.
- `connector_instance` — a configured connector for a tenant (type, direction, config, vault ref). *(P2)*

**Maps & registry**
- ★ `edi_map` — partner map: `(partner, docType, direction, version)`, the DSL JSON, `status`
  (draft/published), `version_no`; **immutable once published, pinned to the relationship.**
- `connector_map` — customer-side map to canonical. *(P2)*
- `map_template` — catalog entry a tenant subscribes to, then overrides. *(P3)*

**Documents & raw**
- ★ `interchange` — ISA-level envelope record: control numbers, partner, direction, ack status.
- ★ `document` — one business doc: tenant, relationship, docType, direction, **canonical JSON**,
  status, timestamps, links to raw + interchange. *(harvest: `edi850/855/856/810` + `x12Job`)*
- ★ `raw_artifact` — immutable raw bytes (object-store pointer + hash), in/out, linked to interchange.

**Control & processing**
- ★ `control_number_sequence` — per-relationship counters for ISA13/GS06/ST02. *(harvest: `x12Data`)*
- ★ `process_log` — lifecycle events, retries, errors, dead-letter. *(harvest: `x12ProcessLogs`)*

**Reference data**
- `code_crossref` — partner code ↔ canonical value (UOM/SCAC/ship-method). *(P3)*
- `product_identity` — SKU/UPC/GTIN cross-reference. *(P3)*
- `x12_dictionary` — per-version segment/element/code-list, for validation. *(P4)*

**Compliance / inventory / sandbox**
- `rule_pack`, `compliance_result` — chargeback rules + per-doc results. *(P4)*
- `inventory_availability` — current stock/price truth per tenant+SKU. *(P5)*
- `sandbox_run`, `test_case` — candidate map runs + golden test cases. *(P3)*

**Audit**
- ★ `audit_log` — append-only record of who/what/when.

---

## 9. A document's journey (one concrete trace)

Sell-side, inbound 850 from a retailer → into the customer's Shopify:

```
1. Retailer drops an X12 850 on SFTP        → Transport (P2)
2. Raw bytes stored, hash recorded           → raw_artifact (immutable)
3. Envelope parsed (ISA/GS/ST), version read → EnvelopeService + interchange row
4. Map selected: (retailer, 850, inbound, 4010) → Registry / edi_map
5. Ingest-EDI runs the map → canonical Order850 → document row (canonical JSON)
6. 997 ack generated back to the retailer     → Emit-EDI (997) + control numbers
7. Emit-data pushes the order into Shopify     → Shopify connector
   (later: validation, compliance flags, inventory sync, control-tower visibility)
```

Every step is a service from §6; every translation is a map from §3; nothing in the path knows
the retailer's name or the X12 version — it's all data.

---

## 10. The phases (how we get there)

Each phase is a clean technical layer **and** a sellable capability. (Detail: `v1-phases.md`.)

| Phase | Adds (layers) | Business outcome |
|---|---|---|
| **1 ★ (now)** | canonical · mapping engine · envelope · x12 | config-driven round trip, zero hardcoded partner logic |
| **2** | connectors · transport · interchange · control#/raw | first real end-to-end (sellable slice #1) |
| **3** | sandbox oracle · agentic onboarding · reference data | onboard a new partner in hours (the moat) |
| **4** | validation · chargeback/compliance | stop the deductions (direct-ROI) |
| **5** | inventory/availability · observability (control tower) | real-time sync + single pane (sellable-complete v1) |

**Rule that keeps it sane:** build the **spine first** (Phases 1–2), then layer the ambitious
pieces onto a working pipe. Never all at once.

---

## The five things to remember
1. **Everything goes through canonical.** Two edges, one hub.
2. **Partners, versions, formats = data (maps), never code.**
3. **The engine is four primitives** — bidirectional & both roles are just wiring.
4. **AI at the edges (onboarding, exceptions); deterministic core in the hot path.**
5. **Spine first, then climb the rungs.**
