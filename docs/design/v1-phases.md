# v1 Implementation Phases — clean, progressive, layered

> The build sequence for v1. Each phase is **technically coherent** (a clean layer that builds
> on the last) **and business-progressive** (ends with a demoable/sellable capability). Organizes
> the M0–M9 milestones (`mvp-build-plan.md`) into shippable increments. Stack: extend current Node.
> Spine-first. 2026-07-30.

## Principles that hold across every phase
- **Config-not-code:** a new partner/client is maps + connector config + rule pack + entitlement.
- **Deterministic hot path, AI at the edges.** Golden-file tests from Phase 1 onward.
- **Multi-tenant + secrets vault + immutable raw** from day one (don't retrofit).
- **Each phase ends with a demo** — breadth is shown thin, depth grows with design partners.

---

## Phase 1 — Deterministic bidirectional core ("the spine") · M0–M1
**Goal:** config-driven translation both ways for one real partner, no external systems yet (files in/out).

**Build:** canonical model (harvest `schema/canonical/*` drafts) · **generic map-interpreter engine**
(Emit: canonical→X12 via `node-x12`; Ingest: X12→canonical with `match`/`unmapped`) · the **map DSL**
(`mapping-design.md`) · envelope/interchange (harvest `ediTemplateParser.js` + `x12settings`) ·
control-number mgmt · **first partner map** (both directions) · **golden-file test harness**.

**Business outcome / demo:** a real **850 ⇄ canonical ⇄ 856/810 round trip driven entirely by a
map file** — "adding a doc type = editing config, not code." Proves the founding thesis internally.

**Exit criteria:** one partner's sell-side doc set round-trips through files, golden-tested, **zero
hardcoded partner logic**. Foundations (`tenant_id`, secrets vault, raw retention) scaffolded.

---

## Phase 2 — Connectors + transport ("the pipe reaches the real world") · M2–M3
**Goal:** real end-to-end flow through actual I/O for a design partner.

**Build:** **Connector SDK/spec** (manifest: auth·direction·capabilities·trigger·connector-map·
sandbox) · **flat-file** (CSV/SFTP/upload) + **generic REST** connectors · **SFTP transport**
(harvest) behind a pluggable interface · **trading-relationship config** · immutable raw storage ·
basic document lifecycle + event flow · **997 acknowledgment** orchestration.

**Business outcome:** first **true end-to-end round trip in a real environment** — "we take your
partner's EDI, land it in your world, and send back compliant docs." **Sellable slice #1.**

**Exit criteria:** a design partner's docs flow in and out via real transport/connector, raw
retained byte-for-byte, 997s handled. (Platform connector — Shopify/ERP — waits on beachhead call.)

---

## Phase 3 — Sandbox oracle + agentic onboarding ("scale the moat") · M4 + M6
**Goal:** turn onboarding from hand-authoring into an AI-assisted, hours-long loop.

**Build:** **sandbox-as-oracle** (structured report schema · upload dashboard · golden capture ·
promotion gate) · deterministic pre-processing algorithms · **onboarding agent** (draft map → loop
against the oracle → minimum-HITL gates) · both-ends support ("we map them" / "they map us").
See `sandbox-onboarding-loop.md`.

**Business outcome:** onboard a **brand-new partner fast** — the cost-structure differentiator and
the scalability unlock; the thing that makes the whole model work. **Sellable capability #2.**

**Exit criteria:** a new partner onboarded end-to-end mostly by the agent, minimum HITL, passing
sandbox certification, promoted to an immutable pinned map.

---

## Phase 4 — Compliance / chargeback control ("the ROI pitch") · M7
**Goal:** stop chargebacks before transmission.

**Build:** **pre-transmit business-rules validator** at the emit path · per-partner **starter rule
packs** (agent-drafted from the IG) · compliance status · plain-language exception explanation.

**Business outcome:** *"we stop the deductions bleeding you"* — direct-dollar ROI (Rung 1).
**Sellable capability #3.**

**Exit criteria:** emit path warns/blocks on the top chargeback triggers (late/missing/mismatched
ASN, qty/price mismatch, bad UPC/GTIN); rule pack per partner; violations explained in plain language.

---

## Phase 5 — Real-time inventory/pricing + control tower ("sellable-complete v1") · M8 + M9
**Goal:** real-time availability/price sync + single-pane visibility.

**Build:** **availability+price service** (846 + connector inventory → one live truth per SKU →
push to channels; buffer rules; event-driven, decoupled from any slow ERP) · **thin VIS control
tower** (flow status · pending acks/ASNs · compliance flags · inventory/price sync status · failures).

**Business outcome:** overselling/suspension prevention + the visible product surface — **completes
the sellable-complete v1.** **Sellable capability #4.**

**Exit criteria:** inventory/price changes propagate to channels near-real-time; control tower shows
the live document + compliance + inventory picture for a design partner.

---

## Sequencing, parallelism & fallback
- **Strictly sequential for the spine:** Phase 1 → Phase 2. Everything hangs off a working pipe.
- **Phase 3 before 4/5** — the oracle/onboarding is the substrate that makes adding partners (and
  their rule packs) cheap. After Phase 3, Phases 4 and 5 can partly parallelize.
- **Start now:** Phase 1's engine/canonical/DSL/envelope work needs **no** beachhead or partner
  decision. Only the *first partner map* (Phase 1 tail) and the *platform connector* (Phase 2) do.
- **If timeline slips** (documented tradeoff): trim **Phase 5 depth first**, then **Phase 3 agent
  autonomy** (fall back to AI-assisted-but-more-manual). The spine (Phases 1–2) never slips.

## What "start" means concretely
Phase 1 begins with reading/harvesting the current engine (envelope layer, parsers, models,
`node-x12` usage), then standing up the canonical model + generic engine + DSL. No partner or
beachhead decision required to begin.
