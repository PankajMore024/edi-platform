# Admin Console — Requirements & Do-Not-Miss Pointers

> The guided visual **configuration console** for the control plane + connectors + AI onboarding
> (admin-first at launch). The runtime EDI flow is NOT in the console — pure backend. This is the
> definitive console spec: surfaces, the pointers that must not be missed, backend provisions already
> built, and what's still to build for launch. Consolidates decisions D30, D48, D53–D57.
> Companions: `visual-workspace-feasibility.md`, `connector-layer.md`, `onboarding-and-config.md`.
> 2026-08-01.

## Principles (hold these — they came from research + decisions)

1. **Config studio, not an n8n runtime-flow canvas.** The console configures; the backend executes.
2. **Grid, not drag-drop, for mapping.** Field mapping = a spreadsheet-style review grid (row per
   field), never free visual field-wiring (the documented trap).
3. **AI drafts, human reviews.** AI onboarding produces the baseline; the console is the review/edit
   surface — not from-scratch authoring.
4. **Source-liberal, canonical-strict.** Liberty on the source side (any column/transform/lookup);
   the canonical schema is fixed & governed — map INTO it, one-offs → `extensions`. This protects the
   canonical (the moat).
5. **No arbitrary code, ever.** Transforms come from a fixed, versioned function library; the DSL
   escape hatch is declarative and sandboxed.
6. **Guided & validated, not free.** Every action runs through the validators; you cannot save an
   invalid relationship/map.
7. **Admin/onboarding-first.** Customer self-serve is a later, gated, expert-backed option.

## Surfaces (screens/components) + do-not-miss pointers

### A. Component library / palette
Lists reusable building blocks from the registries (`MapRegistry`/`SpecRegistry`/`ConnectorRegistry`/
`RelationshipStore` all expose `list(): ComponentDescriptor[]`). Search, filter by kind, drag-in.
→ **Pointer:** every registry already exposes `list()` descriptors — the palette is a thin render of them. The shared **template catalog** (partner maps, specs, connectors) surfaces here = the moat.

### B. Relationship studio (the visual workspace)
A **fixed 3-zone topology** view: `customer systems → [connectors] → CANONICAL → [partner map] → partner`.
Set `format_authority` (client vs partner), `tenant_role`, version, mode; attach components to each zone.
→ **Pointers:** fixed topology (NOT free wiring); `format_authority` is THE switch that selects which
spec governs + who's accountable; the whole relationship is one declarative JSON object (export/import).

### C. Connector instance config
Per connector: **guided auth flow** (OAuth for Shopify/QBO/Amazon; SFTP creds for file), **parse-config**
for files (type/delimiter/encoding/sheet/header), trigger (webhook/poll/file-drop/manual), doc types.
→ **Pointers:** **auth writes to the SECRETS VAULT — config stores only a `vaultRef`, never creds.**
OAuth callback handling lives in the console. Parse-config is data, not code. Trigger choice wires the
lifecycle (webhook needs a backstop reconciliation poll).

### D. Mapping grid (the map review/edit surface)
The spreadsheet-style grid (row per field: source → canonical, with type + transform + status). Used for
BOTH partner maps (segment/element view) and connector maps (column view). **Tiered liberty:**
- **T0 AI draft** (everyone) → **T1 grid point-and-click** (rebind column, set type, pick code cross-ref,
  mark required) → **T2 transform palette** (÷100, ×pack-lookup, trim, upper, concat, split + params) →
  **T3 declarative DSL** (admin/advanced only, sandboxed).
→ **Pointers:** **live preview** (sample row → resulting canonical) always visible; **required-canonical-
field check** (unmapped required → blocked); T2 transforms from a **fixed function library** (no free
code); T3 gated to admins; canonical target is a **fixed dropdown** (can't invent fields; `extensions`
for one-offs); every edit live-validated (shape + conformance).

### E. AI onboarding
Drop the partner's sample EDI (partner-authoritative) or a client's sample file (connector) per doc type
→ agent drafts the map → **review in the grid (D)** → run in the **sandbox (F)** → promote.
→ **Pointers:** the agent infers parse-config + drafts the column/segment map; the human declares what AI
can't infer (unit conversions, cross-refs, partner exceptions); nothing reaches prod without human
approval; every draft is validated in the sandbox first.

### F. Sandbox / certification
Upload real (scrubbed) samples → run the candidate map through the engine + validators → **structured
conformance report** (pass/fail + per-field diffs) → promote to an immutable, pinned version.
→ **Pointers:** the sandbox is where edge cases get caught pre-prod (D57); golden files accumulate here;
promotion = human-approved + immutable + pinned to the relationship.

### G. Observability / control tower
Document/flow status, pending acks/ASNs, validation/compliance flags, **per-connector status** (last
sync, throughput, errors, retries), search, replay/reprocess. (Inventory/price sync status arrives with
Phase 5.)
→ **Pointers:** every document is an event with a status lifecycle; retain immutable raw for replay;
surface missed-webhook/failed-transaction alerts (support-avalanche prevention).

### H. Spec / IG management
Author/edit the **house spec** (client-authoritative) or **import a partner IG** (partner-authoritative);
optionally **publish a partner-facing IG document** from a house spec.
→ **Pointers:** a spec carries `owner` (client/partner); the house spec is real reference data we own;
importing a partner IG is the Layer-2 source for partner-authoritative validation.

## Backend provisions already in place (so the console is a render layer, not a rewrite)

- **Config-as-data** — `TradingRelationship`/`RelationshipDocument`/`EnvelopeConfig` are declarative JSON.
- **Catalogs** — every registry exposes `list(): ComponentDescriptor[]`.
- **Validators** — `MapValidator` (shape) + `ConformanceValidator` (Layer-2) for live validation.
- **Round-trippable** — a relationship (and its refs) is plain JSON: export/import; AI produces it.
- **Map JSON-Schema** — `edi-map.schema.json` for form/grid generation.
- **Pipeline driven by config** — `TranslationPipeline` executes from a `TradingRelationship` (dry-run = preview).

## Still to build for launch

- **Thin API** over: registries (`list`/`get`/`register`), `TranslationPipeline` (dry-run emit/ingest
  for preview), validators (live-validate), AI onboarding (draft-from-samples), sandbox (run/promote).
- **JSON-Schemas** for `TradingRelationship`, `EnvelopeConfig`, `ConnectorInstance`, `Spec` (form-gen) —
  map schema exists; add the rest.
- **OAuth / secrets flows** — console-side OAuth callbacks writing to the vault.
- **Frontend (React):** palette, relationship studio (topology), connector config, the **mapping grid**,
  AI-onboarding drop-samples flow, sandbox view, observability.

## Do-not-miss checklist (single list)

- [ ] Auth → **vault only**; config holds `vaultRef`, never credentials.
- [ ] Mapping = **grid**, not drag-drop; **live preview** always on.
- [ ] **Required canonical fields enforced**; no save on validation failure.
- [ ] Canonical target **fixed** (dropdown); one-offs → `extensions`; **no inventing canonical fields**.
- [ ] Transforms from a **fixed function library**; **no arbitrary code**; DSL tier **admin-gated**.
- [ ] `format_authority` drives spec selection + accountability.
- [ ] Every registry exposes `list()` descriptors for the palette; connectors **self-register**.
- [ ] Forms **generated from JSON-Schemas** (build the missing ones).
- [ ] **Immutable raw retention** + replay surfaced in observability.
- [ ] **Per-connector status**; **webhook backstop poll** for missed deliveries.
- [ ] Sandbox required before promote; promoted versions **immutable + pinned**.
- [ ] Admin-first; customer self-serve gated + expert-backed later.
