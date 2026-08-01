# Visual Workspace / Config Studio — Feasibility (researched)

> Feasibility of a visual workspace for the **control plane + connectors + AI onboarding** (NOT the
> runtime EDI flow, which stays pure backend). Verdict from a deep-research pass (fan-out → fetch →
> adversarial verify). Note: the workflow's auto-synthesis returned a stub; findings below are pulled
> from the run journal (60+ verified claims) + the refuted list. 2026-08-01.

## Verdict

**The refined vision is sound and worth building — as a config/onboarding console, not an n8n flow
canvas — and the research pins down its exact right shape.** The single most actionable finding:
**the map surface should be a spreadsheet-style REVIEW GRID over AI-drafted maps, not drag-and-drop
field mapping.** That's what the incumbents actually ship, and it sidesteps the visual-mapper trap.

---

## What the evidence says (by theme)

### 1. The canonical hub is the industry-converging pattern (strong validation)
- *"Direct 1:1 EDI mapping requires a custom map per partner pair and does not scale — canonical/
  abstraction-layer mapping exists specifically because point-to-point grows unmanageable."*
- Orderful's "zero-mapping" model **standardizes all data into a single JSON structure**; Stedi
  parses **EDI → JSON → transform**. Both are canonical hubs by another name.
- → Our canonical-hub architecture isn't just defensible; it's where the field is landing.

### 2. Pure drag-drop mapping is insufficient — hybrid is the norm (nuanced, not absolute)
- The absolute claim *"visual builders are a usability trap that doesn't scale"* was **REFUTED** as
  too strong. The verified, nuanced truth:
  - *"Visual builders are genuinely valuable as a prototyping/education sandbox, not production-grade."*
  - *"EDI mapping tools deliberately offer BOTH visual and code interfaces"* — vendors don't treat
    pure-visual as sufficient. **Stedi pairs a visual mapper with code (JSONata).**
  - *"Visual automation platforms lack core engineering infra: no version control/Git, no testing,
    only workaround CI/CD."* Experienced users *"revert to a hybrid — visual for orchestration,
    critical logic in code."*
- → Pure drag-drop for the hard 20% (loops, conditionals, code cross-refs, HL) is out. **Hybrid
  (visual/grid for the simple layer + DSL for the rest) + real engineering infra** is the production
  norm — which our **config-as-data-in-Git + validators + golden tests** already provides. That's an
  edge over tools that lack it.

### 3. The map UI incumbents actually ship = a REVIEW GRID (the key finding)
- TrueCommerce's agentic AI mapping surfaces the AI-generated map in a **grid: one row per EDI field
  showing segment, element position, a plain-language label, and the mapped target field** — a
  *spreadsheet-style review UI, explicitly not an n8n-style canvas.* Every map still **routes through
  human expert review before production** (hybrid, not full auto).
- → "Customize the map component" should be a **grid review/edit surface over the AI draft** (+ DSL
  for the complex bits + live preview + our validators). This is concrete, evidence-based, and cheap
  compared to a drag-drop mapper.

### 4. SMBs lean managed / turnkey — customer self-serve flow-building fights the market
- *"Pure self-serve becomes a burden for orgs lacking EDI staff."* *"The self-service value prop of
  user control doesn't match SMB reality, where users end up unsupported."* *"Many businesses have
  the vendor do the mapping config rather than self-serving."*
- SPS, TrueCommerce, Orderful all position as **managed/turnkey**, not self-serve builders; the
  lowest-lift SMB entry is a **Web EDI portal**, not a build-your-own-flow tool. The optimal model is
  **hybrid: self-serve platform + expert support.** (Absolute claims like "must go managed below 30
  partners" were refuted — it's nuanced — but the weight is clearly toward done-for-you for SMBs.)
- → Build the workspace **admin/onboarding-first** (your ops console). Deliver turnkey to customers.
  Customer self-serve config is a later, gated, expert-backed option — never the default.

### 5. AI onboarding is the wave — and a COMPLEMENT, not a replacement (also now table-stakes)
- Orderful (**Mosaic**, AI-native) and **TrueCommerce (agentic AI onboarding/mapping)** are shipping
  this *now* (2026): onboarding months → days, per-partner cost from $500–2,000 → "a few dollars (an
  API call)", 80–94% mapping accuracy **with human review**.
- *"Agentic AI mapping is a COMPLEMENT to expert-driven onboarding — teams work from an AI foundation
  rather than from scratch."* Exactly our sandbox-oracle loop (AI drafts → human approves).
- → Validates our AI-onboarding direction — **but it's becoming table-stakes, not a unique moat.**

### 6. Orchestration canvas is unnecessary
- *"Trading-partner onboarding should be standardized and scalable, not a bespoke custom project per
  partner"*; the runtime flow is a fixed pipeline (parse → translate → validate → 997 → route).
- → No free-form n8n canvas. A guided, validated config studio is the right shape.

---

## Competitive flag (honest)

**AI-onboarding is no longer a differentiator by itself** — Orderful and TrueCommerce already ship
agentic AI mapping. So it's *necessary, not sufficient.* Our moat stays: **dropship-reseller-native +
serving the whole vendor portfolio (EDI + CSV/API) + serving both roles + the seeded template
catalog.** Build AI onboarding because you must to compete — not because it wins alone.

---

## Refined recommendation

- **Build now (backend):** the composable, declarative, serializable **control plane** — the
  substrate both the AI and any UI operate on. (Config-as-data-in-Git = the engineering infra visual
  tools lack.)
- **Phase 3 (the high-value UI):** AI onboarding with a **grid review/edit surface** for drafted maps
  (+ DSL for the 20% + live preview + validators). This is the workspace's map component — a grid,
  not a canvas.
- **Config studio:** a **guided, validated** relationship/connector configurator (light visual +
  component library), admin-first. Not a free-form DAG editor.
- **Retire:** the n8n free-form canvas framing, customer self-serve flow-building as a default, and
  the standalone-iPaaS positioning.

## Sources
Orderful (AI-native / Mosaic, mapping automation, platform-vs-MSP), TrueCommerce (agentic AI
onboarding; connection tiers; managed), Stedi docs (mappings: visual + JSONata, EDI→JSON), Cleo
(web-EDI vs software vs managed; visual editor), ihateedi (managed vs self-service SMB), Babelway→
Tradeshift (spendmatters), Microsoft Logic Apps X12 997, dev.to/mightybot (visual-builder critiques —
several refuted as too absolute).
