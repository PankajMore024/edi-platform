# Project Context & Architectural Decision Log

> Living document. Tracks the journey of productizing the EDI engine into a
> config-driven, vendor-mapped product. Append new entries at the top of the
> Decision Log; never rewrite history — supersede it.

## Goal

Turn a working-but-hardcoded ANSI X12 EDI engine into a **flexible prototype**
that can onboard a 2nd/3rd/4th dropship partner **without code changes**, to
validate with 3–4 real clients before commercializing.

**The moat is not the X12 parser — it's per-partner mapping.** Partners must
become data/configuration, not code.

## Core Invariant — Canonical vs Map (the load-bearing rule)

| Artifact | Scope | Count |
|---|---|---|
| **Canonical schema** | per **(docType, direction)** — partner-AGNOSTIC | one `850.outbound`, one `855.inbound`, … shared by ALL vendors |
| **Vendor map** | per **(partner, docType, direction)** — partner-SPECIFIC | one per vendor per doc |

- Every vendor's doc flows through the **same** canonical shape; their map carries
  the X12 quirks. **Onboarding a vendor = a new map file, never a schema edit.**
- The canonical schema is **stable, not frozen.** It changes only for a genuinely
  new *business fact* — and then **once, centrally, for everyone** (new fields are
  optional, so existing vendors are unaffected). Vendor-specific quirks NEVER
  change it.
- What keeps it agnostic: **typed arrays** (`references`/`ids`/`dates` as
  `{type,value}`) absorb qualifier-coded variation with zero schema change;
  **`extensions`** absorbs true one-offs.
- **Smell test:** wanting to add a canonical field *to satisfy one vendor* → stop;
  it belongs in that vendor's **map** (or a typed-array entry). Only
  business-meaningful-across-partners facts earn a first-class field. A recurring
  `extensions` key across many vendors = signal to graduate it (for everyone).

## Current Baseline (as found)

- **Stack:** Node.js REST API, MySQL + Sequelize, SFTP/FTP document exchange.
- **Docs:** X12 810 / 846 / 850 / 855 / 856 / 997 across the dropship
  order-to-cash lifecycle (846 → 850 → 855 → 856 → 810, each ack'd by 997).
- **Envelope layer (GOOD):** ISA/GS/ST generation is already config-driven per
  partner via `kon_x12settings` + `ediTemplateParser.js`. Partner-agnostic.
- **Transaction-body layer (THE PROBLEM):** segment/element/loop structure is
  hardcoded imperatively in each `utils/parser/edi*Parser.js`. Per-partner
  variation is expressed as **boolean columns + if/else branches**
  (`is_td5`, `inc_td5`, `inc_td505`, `is_ctt`, `inc_vadd`, `is_sac_decimal`,
  `is_shiplist`, `po_type`). Each new quirk = new column + new branch in every
  parser.
- **Leaky abstraction:** "clean JSON in" is not true today — callers pass
  X12-shaped JSON (`beg01`, `po105`, `n104`). Mapping logic is split between
  these parsers and an upstream PHP coreapp.

## ⚠️ IP / Ownership Gate (UNRESOLVED — blocks significant refactor)

Concrete signals this was built under prior employment / for a company product:

1. Remote origin: company GitLab `gitlab.bosontech.ai/Ikonnect-integartion-app/koneect-edi-integration`.
2. Product branding in schema: every table prefixed `kon_` ("Koneect").
3. Not standalone — `edi850Parser.js` calls back into a PHP CodeIgniter
   "coreapp" (`http://localhost/Ci_project/coreapp/webroot/NodeAPIError.php`).
   Order lifecycle/state lives in that PHP app, not this repo.
4. Real partner data committed in `storage/edi/850/` (VENTURES / SIML / WALK)
   and in git history.

**Action required before significant refactor:** confirm clear written rights
to commercialize. Do not push this repo (with real partner files) anywhere new
until settled.

## Decision Log

### 2026-07-31 — Full sell-side doc set complete (850/855/856/810/997)

- **D46. The complete sell-side outbound set works through the one engine.** Added 855 (BAK +
  multi-segment PO1/ACK line loop), 856 (BSN + HL hierarchy), 997 (AK1/AK9). All emit to
  byte-perfect goldens (`test/golden/acme/{855,856,997}/outbound/4010.edi`); 855 also round-trips
  (per-line ackStatus preserved). **HL hierarchy feature added** to the engine (minimal): LoopNode
  `hl` marks a level; MapElement `hl:'id'|'parent'` emits the threaded HL id/parent (counter passed
  through walk — safe for concurrent emits, no instance state). 856 numbers depth-first correctly
  (HL*1**S → HL*2*1*O → HL*3*2*I → HL*4*2*I). DSL types + `edi-map.schema.json` kept in lockstep.
  **46 tests green, stable ×10, build OK.** Limits: 856 INGEST (HL tree reconstruction) deferred —
  sell-side only EMITs 856; ingest-856 is a buy-side concern for later. So sell-side loop (receive
  850 → return 855/856/810/997) is fully generable. NEXT suggestion: COMMIT this checkpoint (platform/
  never committed), then coercion step OR Phase 2 connectors.

### 2026-07-31 — Engine proven DOC-TYPE-AGNOSTIC (810 added, same engine)

- **D45. The engine is doc-type-agnostic — 850 was just the proving fixture.** Added an 810 invoice
  (BIG/IT1/TDS — different segments, financial total) that round-trips byte-perfect through the
  IDENTICAL EmitService/IngestService/EnvelopeService with ZERO engine change (golden
  `test/golden/acme/810/outbound/4010.edi`; TDS decimal-scaled). Proof in
  `mapping/engine/doc-types.spec.ts`. 41 tests green. A new doc type = a canonical shape + a map,
  nothing else. Remaining v1 doc types: 855/846 = same flat pattern (trivial); 856 (ASN) = HL
  hierarchy — engine already supports NESTED loops (LoopNode-in-LoopNode via recursion); HL
  parent/child numbering is a small map+engine addition when we build it; 997 = tiny, generated
  from validation/parse results. DSL `DocType` already enumerates all six.

### 2026-07-31 — Code-review + envelope/ST-SE/control-numbers (full interchange)

- **D42. Independent `/code-review` (high) run on the engine → 6 findings; top 3 fixed +
  regression-tested.** Fixed: (1) ingest infinite-loop when a looped leading segment fails `match`
  (guard: break on non-advancing cursor); (2) `count` silently emitting 0 on a mistyped path (now
  throws); (3) `setPath` silently dropping writes through a primitive (now throws). Deferred/tracked
  (lower severity): formatDate re-emit needs the coercion step; ingest mid-stream desync; composite
  (sub-element `:`) splitting not yet handled.
- **D43. Envelope + trailers + control numbers DONE — a full valid interchange now round-trips.**
  `envelope.service.ts` `buildInterchange` (ISA/GS/ST … SE/GE/IEA; fixed-width space-padded ISA ids;
  UTC dates via `formatDate`; SE count incl ST+SE) + `parseInterchange` (unwrap body + header);
  `control-number.service.ts` (in-memory allocator — ⚠️ production needs ATOMIC durable allocation).
  Golden `test/golden/acme/850/outbound/4010.interchange.edi` (byte-perfect full 850). **38 tests
  green, stable ×15, build+DI OK.**
- **D44. Hooks are LIVE and self-corrected.** The PostToolUse typecheck hook fired on a Write and
  its relative `cd platform` failed (hook cwd ≠ repo root) → fixed to `cd "$(git rev-parse
  --show-toplevel)/platform"` (portable). Property testing again caught a real gap: `fc.date()`
  emitted Invalid Date → `formatDate` correctly throws → test now uses `noInvalidDate:true` + a
  regression test. NEXT: coercion step (strings→typed canonical), OR Phase 2 connectors + transport.

### 2026-07-31 — M1 deterministic map interpreter WORKING (emit + ingest)

- **D41. The generic map engine works end-to-end — the founding thesis proven in code.** A real
  850 round-trips through a declarative map with ZERO hardcoded partner logic. Built + tested:
  `x12.service.ts` (deterministic codec; preserves significant spaces; property: parse∘serialize
  identity), `engine/path.ts` (safe dotted/indexed access, no eval), `engine/predicate.ts` (`when`:
  present / == / != only), `engine/emit.service.ts` (canonical→X12: const/path/count/over/when/
  default/format/decimal/qualifier + gap-fill + trailing-empty trim), `engine/ingest.service.ts`
  (X12→canonical: cursor walk, `over` collects, `match`, `unmapped` capture). Sample map+doc in
  `src/testing/fixtures.ts`; golden `test/golden/acme/850/outbound/4010.edi` (byte-perfect).
  **30 tests green (stable ×4), tsc clean, nest build + DI OK.** Golden output inspected = valid X12.
  KNOWN LIMITS (deliberate, next steps): ingest yields STRING values (canonical-type coercion is a
  later step); role↔X12-code cross-ref not yet (sample carries codes directly); envelope ISA/GS/ST +
  control numbers still stubbed (EnvelopeService); unmapped captures trailing unconsumed only.
  Practice pending: independent `/code-review` high (golden round-trip already served as `/verify`).
  NEXT: envelope + full ST/SE + control numbers, OR Phase 2 connectors.

### 2026-07-31 — Safety scaffolding BUILT + verified (before the engine)

- **D40. Safety scaffolding in place, harness proved on real money-code.** (a) Test harness:
  jest + fast-check + decimal.js; golden-file helper `platform/src/testing/golden.ts` +
  `platform/test/golden/` (UPDATE_GOLDEN=1 to regen). (b) First money-critical primitives built
  test-first: `platform/src/mapping/engine/format.ts` (`applyDecimal` decimal.js ROUND_HALF_UP,
  `formatDate` UTC) — **a property test immediately caught a real bug (negative-zero "-0" amounts),
  now fixed + regression-tested**; 12 tests green. (c) Hooks in `.claude/settings.json` (project,
  committed, portable relative paths): PostToolUse typechecks `platform/**/*.ts` on edit; Stop runs
  `npm test` when platform has changes — both pipe-tested. (d) `.claude/skills/edi-review/SKILL.md`
  domain checklist. (e) `.github/workflows/ci.yml` (typecheck+test; runs once pushed to GitHub).
  Review rigor chosen: `/code-review` high + `/verify` per critical piece. Engine now gets built
  INTO this harness. NOTE: settings.json is new this session — hooks may need `/hooks` or restart
  to activate (watcher caveat).

### 2026-07-31 — Quality/process charter: enforce correctness mechanically

- **D39. Governing dev principle (financial-critical EDI): do NOT rely on the chat/model/any single
  agent being careful — enforce correctness mechanically.** Full charter: `docs/design/quality-and-
  process.md`. The robustness STACK (not any one tool): determinism+golden files · property tests ·
  boundary validation · two-layer business validation · financial-correctness rules (no floats for
  money, atomic control numbers, idempotency, explicit rounding/dates) · hooks+CI gates · independent
  review (subagent/`/code-review`) · sandbox cert + human approval before any live partner · immutable
  raw + replay · observability. Skills encode PROCEDURE; hooks/CI ENFORCE; tests PROVE; human gates
  AUTHORIZE. Recommended custom skills: map-authoring, connector-authoring, canonical-change,
  edi-review, promotion. **Set up safety scaffolding FIRST (golden/property harness + typecheck/test
  hooks + edi-review skill) BEFORE building the engine into it.** User raised this proactively (EDI
  bugs = real financial loss).

### 2026-07-31 — Consolidated architecture overview + DB schema drafted

- **D38. Single plain-language architecture overview** written: `docs/design/architecture-overview.md`
  (big picture · bidirectional 4-primitive engine · mappings · version handling · doc types ·
  shared services · **proposed DB schema (NEW)** · connectors · phases · a worked trace). The DB
  schema is newly designed (grouped tables, ★=v1 core, harvest mappings noted: client→tenant,
  kon_x12settings→trading_relationship+envelope_config, x12Data→control_number_sequence,
  x12Job/x12ProcessLogs→document/process_log, edi8xx models→document/canonical). Needs user review.

### 2026-07-31 — Multiple X12 versions: engine-neutral, version lives in the map

- **D37. How versions are handled (concretizes D13).** Engine (emit/ingest interpreter) is
  VERSION-NEUTRAL — never branches on version. Canonical is version-agnostic. Version is
  STRUCTURAL variation absorbed by the MAP (already a DSL field = GS08). Version has 3 roles:
  (1) SELECTOR — map key = (partner, docType, direction, version); inbound reads GS08, outbound
  from relationship config; (2) ENVELOPE value — stamp/read GS08 (old `control_gsnum`); ISA/GS
  structure stable across 40x0/50x0 so envelope doesn't branch; (3) VALIDATION dictionary key —
  the only truly version-aware component, needs per-version X12 dictionaries as reference data
  (thin v1, grows Phase 4). node-x12 parses generically → x12 module stays version-neutral.
  Anti-duplication: v1 = flat maps embedding version (few partners, fine); later = IG cascade
  (version BASE layer + sparse partner overrides) — deferred (Q3). Audience strategy: 4010 first
  (dominant in retail/dropship), add versions per real partner demand — each new version = a new
  map (+ later a base layer), NEVER engine work. v1 build unchanged.

### 2026-07-30 — X12 is the FIRST partner-format codec, not the only one

- **D36. Format guardrail.** X12 ≠ the only format for the audience. For US/CA dropship+retail,
  X12 is the DOMINANT EDI standard = v1 partner-edge format (the wedge). Others: EDIFACT
  (international — defer), cXML (procurement — defer), VICS (just an X12 IG). The formats that
  matter MOST beyond X12 are NOT rival EDI standards — they're CSV/JSON/REST/portal, handled by
  the CONNECTOR layer on the customer edge (and for API-based "partners" like Amazon SP-API /
  Target+ too; note Amazon/Walmart offer BOTH X12 EDI and APIs). This is WHY the product is
  connector-based, not EDI-only (already decided D17/D20; confirms market-sizing PARTS-iD finding).
  **Architecture rule: canonical stays FORMAT-AGNOSTIC; X12 is the first "partner-format codec"
  behind a clean seam (isolated in `x12`/`envelope` modules; `map.types.ts` = the X12 map
  dialect). EDIFACT/cXML slot in later as siblings — do NOT pre-build them (YAGNI); just don't let
  X12 leak into canonical/orchestration.** v1 scope unchanged.

### 2026-07-30 — Stack locked: greenfield NestJS + TS modular monolith

- **D33. This repo is a CLONE, not the running app** (user clarified) → greenfield freedom; the
  "don't break prod" constraint is gone. **Supersedes D27's "extend current Node in place."**
- **D34. Stack = NestJS + TypeScript, modular monolith, microservice-extractable later.** Fits
  the "modular now, microservices later" goal + the 9-module platform; matches `engine-structure.md`.
  New code lives in `platform/` (fresh NestJS app); the old Express/Sequelize code stays as the
  **harvest source** (envelope layer `ediTemplateParser.js`, `node-x12` usage, boolean-flag domain
  knowledge, canonical schema drafts). Harvest = copy logic/knowledge, framework-agnostic.
- **D35. Phase 1 kickoff:** scaffolded `platform/` NestJS skeleton — Phase 1 core modules
  (canonical, mapping/DSL, envelope, x12). Map DSL types ported from `docs/schema/edi-map.schema.json`.
  Deep logic stubbed (TODO M1); structure first for review.

### 2026-07-30 — v1 consolidated + organized into 5 progressive phases; STARTING

- **D32. v1 strategy consolidated** into `docs/strategy/v1-strategy-brief.md` (sharp one-pager,
  entry point to all detail docs). **v1 organized into 5 clean, progressive, technically+business
  layered phases** in `docs/design/v1-phases.md`: P1 deterministic bidirectional core (spine) ·
  P2 connectors + transport (first real E2E, sellable slice #1) · P3 sandbox-oracle + agentic
  onboarding (scale the moat, #2) · P4 chargeback/compliance (ROI, #3) · P5 real-time inventory +
  control tower (sellable-complete v1, #4). Spine strictly sequential (P1→P2); P3 before P4/5;
  P4/5 can partly parallelize after P3. Fallback if slips: trim P5 depth, then P3 autonomy; spine
  never slips. **MOVING FROM PLANNING TO IMPLEMENTATION.** P1 can start with no beachhead/partner
  decision (only the first partner map + platform connector need it). Stack: extend current Node.

### 2026-07-30 — Sandbox ⇄ onboarding = one closed loop

- **D29. Sandbox and agentic onboarding are ONE system, not two.** Sandbox = deterministic
  ORACLE + environment (run candidate map → validate → diff → STRUCTURED report). Onboarding
  agent = actor that reads the report and loops until green (agent+verifier pattern; oracle
  keeps agent honest). The tie = a closed feedback loop; human enters only at 3 gates (promotion
  approval, low-confidence escalation, ambiguity resolution). Design in `docs/design/
  sandbox-onboarding-loop.md`.
- **D30. One sandbox solves BOTH ends** ("we map their format" vs "they map ours") because
  canonical is always the pivot — same run+report primitive; only remediation differs (fix OUR
  map vs emit partner-facing guidance). Doc direction (in/out) is orthogonal, handled by the 4
  engine primitives.
- **D31. Algorithm-paired agents** (user's instinct, confirmed): deterministic algorithms do the
  mechanical 80% (X12 parse, validation, diff, fuzzy field-match); AI agent only for ambiguous/
  semantic 20% (prose IG interpretation, intent inference, plain-language error+fix). Oracle
  verifies all. **M4 REDEFINED:** must ship the structured oracle + report schema (the agent's
  API), NOT a manual-only harness; M6 agent plugs into it. Open Qs SQ1–SQ4 (report schema,
  confidence metric, Case-B spec publishing, iteration/cost budget).

### 2026-07-30 — v1 scope set, then EXPANDED (founder call)

- **D26. v1 = bidirectional EDI translation engine (canonical↔X12, all 4 primitives) + a small
  connector engine (flat-file + generic REST + one platform/ERP connector), proven as ONE
  vertical slice.** Sell-side first (receive 850 → return 855/856/810/997). Doc set
  850/855/856/810/846/997. Build plan `docs/design/mvp-build-plan.md`.
- **D27. Stack = EXTEND CURRENT NODE** (not a fresh NestJS rebuild). Beachhead client type =
  DECIDED LATER (M1 + flat-file/generic-REST start now; platform connector waits).
- **D28. v1 EXPANDED per founder (sellable-complete): add agentic AI onboarding + chargeback-
  control engine (COMPLY) + real-time inventory/pricing (INV) + thin VIS — spanning Rungs 0–2.**
  Each scoped THIN (demoable, not feature-complete) — thin definitions in the build plan.
  Milestones now M0–M9. **Build order = SPINE FIRST (M1–M5 deterministic round trip) THEN layer
  M6 (AI onboarding, targets sandbox) / M7 (chargeback, hangs off emit path) / M8 (inventory,
  hangs off connectors+846) / M9 (VIS + assemble demo).** Honest tradeoff logged: ~2–3× the pure
  slice, front-loads the two hardest builds (agentic auto-mapping, real-time inventory); if
  timeline slips, cut M8 depth then M6 autonomy first. Iron rule holds: AI at edges, deterministic
  hot path. Still PLANNING — no code until arch judged polished.

### 2026-07-30 — ONE modular platform, not per-client forks; client types = bundles

- **D23. One modular multi-tenant platform; client "type" = a CONFIGURATION (enabled modules
  + maps + rules), never a per-client fork.** Founding principle extended: per-client work =
  config/data (entitlements, connector configs, partner maps, rules), NEVER per-client code.
  Decisive argument = variation: tailoring makes each new client variation an unbounded-cost
  fork; modularity makes it a bounded combination of modules. Modules: CORE, ONBOARD, CONNECT
  (per-connector toggles), COMPLY, INV, VIS, EXC, SKU, OMS. Entitlement bundles = pricing.
  Full matrix in `docs/strategy/client-types-and-packaging.md`.
- **D24. Three client types = three bundles of the same app.** Type1 (no ERP) = full stack
  incl. a place to see/manage; Type2 (needs many connectors) = CORE + heavy CONNECT; Type3
  (has ERP) = everything EXCEPT OMS (we're a layer on their ERP). KEY de-risk: Type1's "small
  ERP" splits into VIS control-tower (visualize & manage — LIGHT, build it, everyone needs it)
  vs OMS-lite (system of record — HEAVY, defer, competes w/ Extensiv/Sellercloud). Most Type1
  clients satisfied by VIS+INV+connectors, no full OMS.
- **D25. "Rungs 0–3 at launch" → VERTICAL SLICE, not horizontal layers.** Platform SPANS all
  rungs (each thin-but-working, demoable) ≠ every rung feature-complete. Launch = deep on ONE
  client (one type) + a couple of their partners end-to-end across rungs (= the land-and-expand
  motion). Beachhead client type = first module build order: recommend Type3 or "upper Type1"
  (has Shopify+QuickBooks) → serve with control tower, NO OMS on day one. Bespoke allowed only
  as reusable module/config harvested back to platform; per-client-only code forbidden.

### 2026-07-30 — Operational-pain analysis; translation→orchestration; NO ERP build

- **D20. Translation is the ante; orchestration is the value.** From analysis of user's
  `# Research Notes.md` (`docs/strategy/operational-pain-analysis.md`): EDI translation tech
  is commoditized, but per-partner IG variability, onboarding, and the fear/expertise gap are
  NOT (these confirm our moat). The durable value + defensibility lives one layer up in
  **operational orchestration** (compliance/chargebacks, inventory sync, exceptions, SKU
  identity, visibility, returns). Correction is EMPHASIS not direction: elevate arch layers
  H (validation) / I (workflow) / G (reference data) / L (observability) from "expansion" to
  a deliberate **value ladder**. Positioning: sell "compliance + orchestration," translation
  as enabler — not "EDI translation."
- **D21. NO ERP build/attach (user asked).** Building/attaching an ERP = scope trap + channel
  conflict + doesn't solve the pain. Instead: (a) a focused **Inventory/Availability
  Orchestration service** (event-driven fast availability truth; decouples channel accuracy
  from the customer's slow ERP — solves the "real-time weakest link" concern without touching
  their ERP); (b) ERPs are **connectors** (QuickBooks/NetSuite/BC/Odoo); (c) optional
  **OMS-lite** (inventory & order hub, NOT accounting) for ERP-less customers — Phase 3+,
  deliberate only (competes with Extensiv/Sellercloud). New arch open Qs Q8–Q10.
- **D22. Value ladder / prioritization** (fight scope creep — the failure mode): Rung 0 wedge
  = EDI compliance + AI onboarding + sandbox; Rung 1 = chargeback prevention + pre-transmit
  business validation (direct-$ ROI); Rung 2 = inventory/availability + visibility; Rung 3 =
  exception intelligence + SKU identity graph; Rung 4 = multi-supplier/warehouse, returns,
  OMS-lite. Climb a rung only when a real customer pulls you there.

### 2026-07-28 — FINAL PRODUCT APPROACH locked (connector-based, bi-directional)

- **D17. Final approach = connector-based EDI compliance platform.** A three-surface
  translation model — customer-data (connectors: CSV/DB/API/Shopify/QuickBooks/…) ↔
  canonical hub ↔ partner EDI — serving **both roles** (customer as supplier/sell-side
  AND as buyer/buy-side), **bi-directional**, with **agentic AI on the outskirts**
  (onboarding = auto-draft maps; sandbox/certification env) and a **deterministic
  translation core**. Pitch: "Keep your spreadsheet. We speak EDI to your big partners
  for you." Why-doc: `docs/strategy/product-vision.md`.
- **D18. The pain = the EDI-mandate moment** (big partner forces an SMB onto EDI) — the
  proven core of the EDI SaaS market (SPS/TrueCommerce lineage). Wedge = **sell-side
  first** (receive 850, return 855/856/810/997) — the mirror of today's buy-side engine,
  but within the symmetric direction-aware design. CSV/API is not a separate product —
  it's the customer-facing *input edge* of the same pipe (resolves the earlier EDI-vs-CSV
  tension). Variability across partners/sources is the MOAT, tamed by canonical+maps+AI.
- **D19. Connector layer = heaviest build**, first-class. Connectors = thin adapter (SDK)
  + declarative connector-map to canonical (symmetric with partner EDI maps). **Top-5
  pre-built for prod:** flat-file (CSV/SFTP/upload), Shopify, Amazon SP-API, QuickBooks
  Online, generic REST/webhook. Full target architecture (layers, sandbox, AI, harvest-vs-
  rebuild, phased restructuring path, open Qs Q1–Q7) in `docs/design/target-architecture.md`.
  Status: ARCHITECTURE DRAFT — user will revise/iterate before any implementation.

### 2026-07-28 — IP gate CLEARED + business analysis

- **D15. IP/ownership gate RESOLVED.** User confirmed clear rights to commercialize
  (O2 closed). Posture moves from "design only" to "cleared to build the business."
  Still: don't push real partner files (`storage/`, git history) anywhere new
  without scrubbing.
- **D16. Business thesis recorded** in `docs/strategy/business-analysis.md`. Wedge =
  the **dropship reseller-in-the-middle** seat (buys from many vendors, fans out to
  marketplaces) — the seat the user occupies and incumbents (SPS, Rithum/CommerceHub,
  Logicbroker) ignore. The current buyer-side, one-directional flow is ICP FIT, not a
  limitation. Moat = shared vendor-template catalog seeded from the user's own 60–70
  integrations + AI auto-onboarding that collapses incumbents' setup-fee cost structure.
  AI at the edges (auto-mapping / compliance monitoring / triage), deterministic
  translation hot path. Answers lean: S1 = dropship wedge; S2 = "EDI as a Service";
  S4 = compliance as expansion, not MVP.

### 2026-06-15 — Platform-altitude analysis (multi-tenant EDI SaaS)

- **D12. Scope expanded to full multi-tenant SaaS** ("EDI as API" + "EDI as a
  Service") for dropship/retail. Full analysis in
  `docs/saas-architecture-analysis.md` (txn-set coverage, version strategy, IG
  cascade, canonical critique, mapping-engine abstractions, multi-tenant, target
  state, blind spots).
- **D13. Key architectural positions:** canonical = version-AGNOSTIC, translation
  = version-AWARE; IG (not X12 version) is the unit of value, modeled as a layered
  cascade (base→industry→partner→relationship→tenant); NO arbitrary code in maps
  (declarative DSL + function library); centralized code cross-reference + master
  data; retain immutable raw bytes; API-first + pluggable transport + event-driven
  observable core; shared partner-template catalog = the moat.
- **D14. Honest reframing:** the current repo is a prototype, not the platform;
  target state is a rebuild that harvests domain logic. Still gated by IP (O2).
- New strategic open questions S1–S4 (wedge, GTM, catalog timing, compliance
  product) added below.

### 2026-06-07 — Canonical/Map invariant recorded

- **D11. Canonical schema is shared & partner-agnostic; only the map is
  vendor-specific.** See "Core Invariant" section above. Canonical is per
  (docType, direction); maps are per (partner, docType, direction). Schema changes
  are rare, central, and additive; vendor differences live in maps + typed
  arrays + extensions. Drafts in `docs/schema/canonical/` are stable-but-not-frozen
  pending the real coreapp payload (O4).

### 2026-06-07 — Canonical API model resolved (O1)

- **D7. Canonical-model front door confirmed.** The engine's API speaks a clean,
  X12-agnostic **canonical business document** per doc type; maps translate
  canonical ↔ X12. Resolves O1.
- **D8. Coverage strategy: core + typed arrays + extensions.** First-class fields
  for common business facts; qualifier-coded repeating segments (REF/DTM/N1/N9/…)
  modeled as typed `{type,value}` arrays so new qualifiers need no schema change;
  rare one-offs go in an `extensions` escape hatch (watch what accumulates there —
  it's the backlog of fields to graduate). Canonical = superset of *meaning*, not
  superset of every partner's *segments*.
- **D9. Separate inbound/outbound document shapes, shared sub-components.**
  Top-level docs differ by direction (outbound = clean generated doc; inbound =
  parse result with per-line status, `unmapped` capture, source/control metadata).
  Sub-objects (address/party/reference/lineItem/charge) are shared via `$ref` from
  a common schema, so "separate documents, shared parts."
- **D10. Coreapp payload schema** to be supplied by user (scrubbed); will be
  reverse-engineered into the canonical 850 schema + a gap table (clean-map /
  drop-as-X12-leakage / needs-extension). Draft canonical schemas below were
  authored from an assumed payload pending that.

### 2026-06-07 — Initial review & design direction

- **D1. Refactor posture: DESIGN ONLY.** No engine refactor until IP ownership
  is confirmed in writing. Design proceeds provider/employer-agnostic, copying
  no proprietary specifics.
- **D2. Product boundary: LEANING "Node engine is the product" — NOT yet
  confirmed.** Recommendation is a canonical business-document API at the front
  door (clean JSON in), with the per-partner map as the only X12-aware artifact;
  PHP coreapp callback becomes an optional client webhook. User answered "not
  sure yet"; open question O1 tracks the confirmation.
- **D3. First proving ground: ONE FULL 850 ROUND-TRIP** — 850 outbound
  generation + inbound 855 / 997 acknowledgment parsing — config-driven
  end-to-end before fanning out to other doc types.
- **D4. Mapping schema shape:** three layers — (A) envelope config (already
  exists, keep), (B) per-(partner, docType, direction) declarative document map
  that replaces hardcoded sequences AND boolean flags, (C) one generic engine
  that interprets maps and still feeds `node-x12`. See `mapping-design.md`.
- **D5. Maps live as JSON FILES in git** for the prototype (diffable,
  reviewable, no migration), not a DB table. Revisit when a UI / runtime editing
  is needed.
- **D6. Prototype guardrails (do NOT build yet):** no unified bidirectional map,
  no DB-backed maps, no visual mapper, no transform DSL beyond
  `const / path / count / date / format / decimal / when / match`. Add operators
  only when a real partner forces one. A JSON-Schema validating the maps + a
  required-element check is the infra ceiling for now.

## Open Questions

- **O1 (RESOLVED 2026-06-07):** Canonical-model front door — see D7–D9.
- **O2:** IP ownership confirmation (see gate above).
- **O3:** Product boundary final call (depends on O2). Leaning "Node engine is
  the product" now that the canonical API model is decided.
- **O4:** Validate draft canonical schemas against the real coreapp payload (D10).
- **S1 (strategy):** Wedge = traditional X12 retail, or dropship/marketplace
  (API-heavy)? Decides connectors-first vs X12-breadth-first.
- **S2 (strategy):** Primary GTM for first 3–4 clients — "EDI as API" or "EDI as a
  Service"? Different first investments.
- **S3 (strategy):** Shared partner-template catalog early (moat) vs bespoke maps
  per early client (faster revenue)?
- **S4 (strategy):** Compliance/scorecard as a product line — in or out of MVP?

## Artifacts

> Full map in `docs/README.md` (the index). Reorganized 2026-06-16 into
> `design/`, `schema/`, `examples/`.

**Design** (`docs/design/`)
- `mapping-design.md` — three-layer mapping schema & engine design.
- `engine-structure.md` — NestJS module target + fault-tolerant coercion.
- `saas-architecture-analysis.md` — multi-tenant SaaS analysis.

**Schema** (`docs/schema/`)
- `edi-map.schema.json` — JSON-Schema that validates partner maps.
- `canonical/README.md` — canonical contract + input/output convention.
- `canonical/common.schema.json` — shared sub-components, incl. `inboundMeta`.
- `canonical/850|855|856|997.schema.json` — **direction-neutral** business docs
  (one per doc type; D9 revised — see decision log). Each has a `*.example.json`.

**Examples** (`docs/examples/`)
- `850.map.example.json` — worked 850 partner map.
- `856-walkthrough/` — full three-layer 856 walkthrough (was `samples/856/`).
