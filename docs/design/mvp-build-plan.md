# MVP Build Plan / To-Do — Bidirectional EDI + Connector Engine (v1)

> The concrete starting scope: a **config-driven, bidirectional EDI translation engine**
> (canonical ↔ X12, both directions) + a **small connector engine (a few connectors)**,
> proven as one **vertical slice** for a design partner. Serves both dropship suppliers and
> supply-chain retailers via the same symmetric engine.
> Grounded in: `../strategy/product-vision.md`, `target-architecture.md` (§10 phasing),
> `../strategy/client-types-and-packaging.md` (vertical-slice launch). 2026-07-30.
> **Status: PLANNING. No implementation until gating decisions (M0) are made and the
> architecture is judged polished enough to build.**

---

## Scope of v1 (what this IS) — EXPANDED per founder call (2026-07-30)

Founder decision: v1 must be **sellable-complete**, so it spans **Rungs 0–2 plus agentic AI**,
each delivered as a **THIN slice** (enough to demo and sell — NOT feature-complete). Stack:
**extend the current Node app**. Beachhead client type: **decided later** (platform connector
waits; everything else starts now).

- **Modules in scope:** CORE (translation) · CONNECT (engine + a few connectors) · **ONBOARD
  with AGENTIC AI** (agent drafts maps) · **COMPLY** (chargeback-control engine) · **INV**
  (real-time inventory/pricing) · a **thin VIS** to surface compliance + inventory status.
- **Bidirectional:** all four primitives — Ingest-EDI, Emit-EDI, Ingest-data, Emit-data.
  **Prove the sell-side direction first** (the EDI-mandate wedge: receive 850 → return
  855/856/810/997), the mirror the current engine lacks.
- **Doc set:** 850, 855, 856, 810, 846, 997 (harvest canonical drafts + parsers). 846 matters
  more now — it feeds INV.
- **One design partner, one or two of their trading partners, end-to-end**, golden-file tested.

### What "THIN" means for the three ambitious capabilities (so v1 is achievable)

- **Agentic AI onboarding (thin):** an agent ingests a partner IG + sample EDI → drafts a map in
  the DSL → tests it in the sandbox → a human reviews/approves. Scope to the **first partner, the
  sell-side doc set**. NOT: fully autonomous, self-certifying, or all partners/versions.
- **Chargeback-control engine (thin):** a **pre-transmit business-rules validator** that catches
  the top chargeback triggers from the research notes (late/missing ASN, ASN↔PO mismatch, qty/
  price mismatch, missing required REF, invalid UPC/GTIN) using a **starter rule pack per
  partner** → warn/block + compliance status. NOT: full scorecard analytics or ML prediction.
- **Real-time inventory/pricing (thin):** an **availability+price service** that ingests vendor
  846 + connector inventory into **one current truth per SKU** and **pushes fast updates out to
  channels** with basic buffer rules. NOT: multi-warehouse allocation, order-splitting, or
  reserve-on-order.

## Explicitly NOT in v1 (still deferred — hold the line)

OMS-lite (system-of-record), full EXC automation (beyond plain-language exception explanation),
full SKU identity graph, full compliance scorecard/analytics, multi-warehouse & order-splitting
orchestration, returns/reverse logistics, AS2/VAN transport, multi-tenant scale-out, the full IG
cascade. Each is a later rung — see `../strategy/operational-pain-analysis.md` §5.

---

## M0 — Gating decisions & foundations (DO FIRST — these unblock everything)

- [ ] **Stack call (arch Q5):** extend current Node, or the NestJS-module target in
  `engine-structure.md`. *Blocks all code.*
- [ ] **Beachhead client type** (Type 3 "has ERP" vs "upper Type 1" Shopify+QuickBooks) —
  picks the first platform connector. See `client-types-and-packaging.md`.
- [ ] **First trading partner / retailer program (arch Q7)** — fixes the first partner map + IG
  (e.g. Target Plus / Walmart DSV / Wayfair / a real design-partner's retailer).
- [ ] **Confirm sell-side first** (receive 850, return 855/856/810/997) vs buy-side.
- [ ] **Foundations that must NOT bake in single-tenant assumptions:** `tenant_id` on all data
  from day one; partner + connector credentials in a **secrets vault**, never config tables.
- [ ] **Repo hygiene / IP caution:** scrub real partner files (`storage/`, git history:
  VENTURES/SIML/WALK) before any new repo or push. (IP is cleared, but don't leak partner data.)

---

## M1 — Canonical + deterministic engine (the bidirectional core)

- [ ] Finalize canonical schemas for the v1 doc set (harvest `docs/schema/canonical/*` drafts).
- [ ] Build the **generic map-interpreter engine** that replaces the hardcoded `edi*Parser.js`:
  - [ ] **Emit path:** canonical → X12 (drives `node-x12`).
  - [ ] **Ingest path:** X12 → canonical (with `match` for occurrence, `unmapped` capture).
- [ ] Implement the **map DSL** per `mapping-design.md` (const/path/count/when/match/format/
  decimal + the minimal operator set — add operators only when a real partner forces one).
- [ ] **Envelope/interchange layer** (harvest `ediTemplateParser.js` + `kon_x12settings`):
  ISA/GS/ST build + parse, control-number management, dedup/idempotency (basic).
- [ ] Author the **first partner map(s)** for the chosen partner — both directions.
- [ ] **Golden-file tests** for the first partner round-trip (the regression backbone).

## M2 — Connector engine + a few connectors

- [ ] **Connector SDK / spec** (the reusable engine): manifest = auth · direction(s) ·
  capabilities · trigger model · connector-map · sandbox behavior. (See `target-architecture.md` §4.1.)
- [ ] **Connector-map** support (native shape ↔ canonical) — reuse the map DSL where possible.
- [ ] Build **the few** (start with the two that are beachhead-independent, add the third after M0):
  - [ ] **Flat-file** (CSV/Excel/fixed-width via SFTP + upload) — universal; unblocks anyone.
  - [ ] **Generic REST/webhook** — configurable escape hatch.
  - [ ] **One platform connector** — Shopify (upper-Type-1) *or* the chosen ERP (Type 3), per M0.
- [ ] Wire **Ingest-data / Emit-data** primitives to the connectors.

## M3 — Transport, orchestration slice & storage

- [ ] **Transport:** SFTP first (harvest), behind a pluggable interface (AS2/VAN later).
- [ ] **Trading-relationship config:** which docs flow which direction, over which transport,
  with which maps (this is how a "client type" becomes configuration, not code).
- [ ] **Immutable raw artifact storage** — every received EDI **and** every received customer
  file, byte-for-byte (audit/dispute). Non-negotiable even in v1.
- [ ] Basic **document-lifecycle state** + a simple event flow (queue) so it's replayable.
- [ ] **997 acknowledgment** orchestration for the round trip.

## M4 — Sandbox-as-ORACLE (the environment + verifier the agent loops against)

> See `sandbox-onboarding-loop.md`. M4 is NOT a "manual pre-AI" harness — it must ship the
> **structured oracle** so M6's agent plugs straight in. The report schema is the agent's API.

- [ ] Sandbox run primitive: apply a candidate map to a test case → run engine → validate
  (syntactic vs IG + business rules) → diff vs expected → **STRUCTURED, machine-readable
  conformance report** (segment/element/loop, expected-vs-got, rule violated). *(SQ1 — design
  the report schema carefully.)*
- [ ] **Upload dashboard** (human-facing): upload each doc type per partner, see conformance —
  serves both directions ("we map them" / "they map us"; canonical is the pivot).
- [ ] Golden-file capture: passing test cases accumulate into the regression suite.
- [ ] Promotion gate: only a passing, **human-approved** map is published/immutable and pinned
  to the relationship. (Minimum HITL — see the loop doc §5.)

## M5 — Prove the deterministic vertical slice end-to-end (the SPINE)

- [ ] One design partner, **sell-side round trip**: Ingest-EDI(850) → Emit-data(into their
  world via one connector) → Ingest-data(shipment/invoice) → Emit-EDI(855/856/810/997),
  golden-tested, run through sandbox then "prod."
- [ ] **This spine must work before M6–M8 layer onto it.** Everything ambitious hangs off it.

## M6 — Agentic AI onboarding (thin) — layers onto the spine

- [ ] **Onboarding agent** (agentic loop, Claude): ingest partner IG (PDF/text) + sample EDI →
  explore → **draft a map in the DSL** → run it through the M4 sandbox → iterate on failures →
  present a reviewed draft to a human. Scope: first partner, sell-side doc set.
- [ ] **Iron rule enforced:** agent *proposes*, deterministic engine *executes*, human *approves
  promotion*. No AI in the runtime translation path.
- [ ] (Stretch) agent also drafts the **starter compliance rule pack** (feeds M7) from the IG.

## M7 — Chargeback-control engine (thin) — hangs off the emit path

- [ ] **Pre-transmit business-rules validator** at the Emit-EDI point: run a per-partner rule
  pack (late/missing ASN, ASN↔PO mismatch, qty/price mismatch, missing required REF, invalid
  UPC/GTIN) → **warn/block + compliance status**.
- [ ] Surface results in the thin VIS (below). (Agentic AI angle: exception/plain-language
  explanation of failures + suggested fix.)

## M8 — Real-time inventory/pricing (thin) — hangs off connectors + 846

- [ ] **Availability+price service:** ingest vendor **846** + connector inventory → maintain
  **one current truth per SKU** (with basic buffer rules) → **push fast updates to channels**
  via the connector layer. Event-driven; decouples channel accuracy from any slow ERP.
- [ ] Surface current availability/price + sync status in the thin VIS.

## M9 — Thin VIS (control tower slice) + assemble the sellable demo

- [ ] Minimal dashboard: document flow status, pending acks/ASNs, **compliance flags (M7)**,
  **inventory/price sync status (M8)**, failed transactions. Read-first; basic actions.
- [ ] Assemble the full **sellable story**: round trip + AI-onboarded partner + chargeback
  guardrails + real-time inventory, for one design partner. Land-and-expand from here.

---

## Build order & the honest tradeoff (expanded v1)

**Order matters more now that v1 is bigger.** Build the deterministic spine, THEN layer the
ambitious capabilities onto a working pipe — never all in parallel integrated at the end:

```
M0 → M1 → M2 → M3 → M4 → M5  (the SPINE: bidirectional engine + connectors + round trip)
                              └── then, each hanging off the working spine:
                                  M6 AI onboarding (targets the M4 sandbox)
                                  M7 chargeback engine (hangs off the M5 emit path)
                                  M8 real-time inventory (hangs off connectors + 846)
                                  M9 thin VIS + assemble the sellable demo
```

- **Honest tradeoff:** this v1 is ~2–3× the pure vertical slice, and it front-loads the two
  hardest builds in the whole product — **agentic auto-mapping (M6)** and the **real-time
  inventory service (M8)**. Accepted as a deliberate founder call (sellable-complete v1). The
  mitigation is the thin-slice definitions above + this spine-first order. If timeline slips,
  the first things to cut back to "later" are M8 depth, then M6 autonomy (fall back to
  AI-assisted-but-more-manual).
- **Start now without the beachhead:** M1 + M2 (flat-file + generic REST) are beachhead-
  independent. Only the *platform* connector (M2, third item) waits on the beachhead call.
- **Bidirectional from the start, prove one direction first.** Build both paths (M1); drive the
  sell-side round trip (M5) end-to-end before the buy-side.
- **Config-shaped, never client-shaped.** A new client/partner must be a new map + connector
  config + rule pack + entitlement — never code. If it isn't, fix the abstraction before the
  second partner.
- **Agentic AI stays at the edges** (M6 onboarding, M7 exception explanation), deterministic
  core (M1) in the hot path — the iron rule holds even in v1.

## Open questions carried into the build

- Arch Q1 (856 hierarchy depth), Q2 (connector-map DSL = partner DSL?), Q3 (flat map vs IG
  cascade in v1), Q5 (stack), Q7 (first partner) — see `target-architecture.md` §11.
- Beachhead client type — see `client-types-and-packaging.md`.
