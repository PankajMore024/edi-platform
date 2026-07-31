# v1 Strategy Brief — the sharp version

> One-page distillation of everything decided so far. The single entry point; detail lives in
> the linked docs. 2026-07-30.

## Product (one line)
> **"Keep your spreadsheet. We speak EDI to your big partners for you."**

A **connector-based, bidirectional EDI platform** for dropship & supply-chain SMBs, with
**agentic AI onboarding** and a **deterministic translation core**. → `product-vision.md`

## The wedge
The **EDI-mandate moment** — a big partner forces an SMB onto EDI, and the deal is on hold until
they're compliant. The largest, most-proven pain in the category (SPS Commerce lineage). We
enter **sell-side** (receive 850 → return 855/856/810/997). → `operational-pain-analysis.md`

## Who we serve
The **dropship reseller-in-the-middle** and supply-chain suppliers — the seat incumbents (SPS,
Rithum, Logicbroker) ignore or over-price. Three client types (no-ERP / many-connectors /
has-ERP) are **entitlement bundles of ONE modular platform — never per-client forks.**
→ `client-types-and-packaging.md`, `market-sizing.md`

## Why we win / the moat
- **Dropship-native** + we serve the **whole vendor portfolio** (EDI *and* CSV/API via connectors).
- **AI-collapsed onboarding** undercuts incumbents' setup-fee cost structure.
- **Shared vendor-template catalog**, seeded from your own 60–70 real maps (the cold-start moat).
- **AI at the edges** (onboarding, exceptions); **deterministic, golden-tested core** in the hot path.

## What v1 delivers (sellable-complete, each piece THIN, spine-first)
Bidirectional EDI engine · a few connectors (flat-file · generic REST · +1 platform/ERP) ·
**agentic AI onboarding** (sandbox-oracle loop) · **chargeback-control engine** · **real-time
inventory/pricing** · a **thin control tower**. → `../design/mvp-build-plan.md`,
`../design/v1-phases.md`, `../design/sandbox-onboarding-loop.md`

## Non-negotiables from day one
Config-not-code (a new partner/client = maps + connector config + rule pack + entitlement, never
code) · multi-tenant (`tenant_id`) · secrets vault · immutable raw retention (audit/dispute) ·
deterministic translation hot path · golden-file regression tests. **Stack: extend current Node.**

## Explicitly deferred (hold the line)
OMS-lite · full compliance scorecard/analytics · SKU identity graph · multi-warehouse &
order-splitting · returns/reverse logistics · AS2/VAN · full IG cascade · multi-tenant scale-out.

## The moat check, when in doubt
The pain is proven and specific; the fear we sell into is real and durable; our unfair advantage
(60–70 live integrations) already exists; the per-partner variability is the moat, not the
obstacle. Narrow wedge, deep moat, climb one funded rung at a time.
