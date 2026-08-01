# Admin Console — vision & the provisions already baked in

> The guided visual **configuration console** (admin-first) for the control plane + connectors +
> AI onboarding. Runtime EDI flow is NOT in the console — it's pure backend. This doc records the
> console's shape AND the architectural provisions we've built into the control plane *now* so the
> console can be built later but shipped for launch. See `visual-workspace-feasibility.md` (research
> verdict) and `onboarding-and-config.md`. 2026-08-01.

## Shape (evidence-based, from the research verdict)

- A **guided, validated config studio** — a component library/palette + a visual relationship view —
  NOT an n8n free-form canvas (EDI flow is a fixed backend pipeline).
- The **map surface is a spreadsheet-style REVIEW GRID** over AI-drafted maps (one row per field:
  segment · element position · plain-language label · target field), + a DSL editor for the complex
  20% + live preview + validators. **Not** drag-and-drop field mapping (the documented trap).
- **Admin/onboarding-first** (our ops console). Customer self-serve is a later, gated, expert-backed
  option — SMBs lean turnkey.
- **AI onboarding integrated**: drop the partner's sample EDI per doc type → agent drafts the map →
  human reviews/tweaks in the grid → sandbox validates → promote.

## Provisions already in the backend (so the console is buildable, not a rewrite)

The control plane was built **console-ready** on purpose:

| Provision | Where | Why the console needs it |
|---|---|---|
| **Config-as-data** (declarative, JSON, no code) | `control-plane/config.types.ts` (`TradingRelationship`, `RelationshipDocument`, `EnvelopeConfig`) | The console reads/writes exactly these objects; a relationship is fully described by data. |
| **Component catalog** (`list(): ComponentDescriptor[]` — id, kind, name, description) | `MapRegistry`, `SpecRegistry`, `RelationshipStore` | Powers the palette/library (list, search, drag-in). |
| **Id-keyed registries** (map/spec/relationship) | same | The console's CRUD targets; refs by id link components. |
| **Config drives execution** (pipeline selects map/spec by config) | `TranslationPipeline` | The console *configures*; the pipeline *executes* — clean separation, engine stays pure. |
| **Load-time validators** (shape + conformance) | `MapValidator`, `ConformanceValidator` | Live validation in the console; refuse to save invalid config. |
| **JSON-Schema for form-gen** | `edi-map.schema.json` (map) | Auto-generate config forms; the map grid renders from it. |
| **Round-trippable relationship JSON** | `TradingRelationship` is a plain object | Export/import a whole integration; AI onboarding produces this shape. |

## Still to build for launch (frontend + thin API)

- **Backend API** exposing: registries (`list`/`get`/`register`), `TranslationPipeline` (dry-run
  emit/ingest for preview), validators (live-validate), AI-onboarding (draft-map-from-samples).
- **JSON-Schemas** for `TradingRelationship`, `EnvelopeConfig`, `Connection`, `Spec` (for form-gen)
  — map schema exists; add the rest when the console is built.
- **Frontend** (React): the config studio (relationship view + component palette), the **map review
  grid**, the AI-onboarding drop-samples flow, and observability (document/flow status).

## Status

Backend provisions: **in place** (control plane built declarative + catalog-exposing + validated).
Frontend console: **deferred, planned for launch.** No engine change is needed to add it — it's a
presentation layer over the declarative control plane.
