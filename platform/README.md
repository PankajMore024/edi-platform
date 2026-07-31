# EDI Platform (v1)

Connector-based, bidirectional EDI platform. **NestJS + TypeScript modular monolith**, structured
so any module can be extracted to a microservice later without a rewrite.

> Strategy & design live in `../docs/` — start with `../docs/strategy/v1-strategy-brief.md`,
> then `../docs/design/v1-phases.md` and `../docs/design/target-architecture.md`.
> This `platform/` tree is the greenfield build; the surrounding Express/Sequelize app is the
> **harvest source** (envelope logic, `node-x12` usage, boolean-flag domain knowledge, canonical drafts).

## Getting started

```bash
cd platform
npm install
npm run start:dev     # watch mode
npm test              # jest (golden-file tests land in Phase 1 M1)
npm run build         # compile to dist/
```

## Module structure (Phase 1 = the deterministic core)

```
src/
  main.ts                    bootstrap
  app.module.ts              root; phases register their modules here
  canonical/                 version-agnostic business documents (the hub)
    types/common.types.ts      Address/Party/LineItem/TypedValue/Charge/Extensions
    types/document.types.ts    CanonicalMeta/InboundMeta/Order850 (+ 855/856/810/846/997 in M1)
  mapping/                   the deterministic translation engine
    dsl/map.types.ts           the EdiMap DSL (ported from docs/schema/edi-map.schema.json)
    engine/emit.service.ts     canonical -> X12   (declarative; replaces hardcoded generators)
    engine/ingest.service.ts   X12 -> canonical   (declarative; replaces hardcoded parsers)
  envelope/                  ISA/GS/ST build+parse (harvest of ediTemplateParser.js, bidirectional)
  x12/                       thin wrapper over node-x12 (the only place that knows the raw lib)
```

Dependency direction: `mapping` → `envelope`, `x12`; `canonical` is pure contracts. Clean, acyclic.

## Phase roadmap (see ../docs/design/v1-phases.md)

| Phase | Adds | Outcome |
|---|---|---|
| **1 (now)** | canonical · mapping · envelope · x12 | config-driven round trip, zero hardcoded partner logic |
| 2 | connector · transport · interchange | first real end-to-end (sellable slice #1) |
| 3 | sandbox · onboarding (agentic) | onboard a new partner in hours (the moat) |
| 4 | compliance | chargeback prevention (direct-ROI) |
| 5 | inventory · visibility | real-time sync + control tower (sellable-complete v1) |

## Conventions (non-negotiable from day one)

- **Config, not code:** a new partner/client = new map + connector config + rule pack + entitlement.
- **Deterministic hot path:** the translation engine is pure and golden-file tested. AI lives at the
  edges (onboarding, exceptions) — never in the translation path.
- **Multi-tenant** (`tenantId` on canonical docs), **secrets vault** for partner/connector creds,
  **immutable raw** retention for every received artifact.

## Status

Phase 1 skeleton — module structure + core type contracts in place; engine/service bodies are
stubbed with `M1 TODO`. Next: implement the DSL interpreter (emit + ingest) and the first partner
map, with a golden-file round trip.
