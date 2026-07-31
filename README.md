# EDI Platform

Connector-based, **bidirectional EDI (X12)** platform for dropship & supply-chain SMBs.

A deterministic **canonical ⇄ X12** translation engine where partners, document types, and
versions are **data (declarative maps), not code** — with agentic AI reserved for the edges
(onboarding, compliance), never the translation hot path.

> Pitch: *"Keep your spreadsheet. We speak EDI to your big partners for you."*

## Layout

- **`platform/`** — the engine (NestJS + TypeScript). Start with [`platform/README.md`](platform/README.md).
- **`docs/`** — strategy & architecture. Start with [`docs/strategy/v1-strategy-brief.md`](docs/strategy/v1-strategy-brief.md)
  and [`docs/design/architecture-overview.md`](docs/design/architecture-overview.md).

## v1 status

- Deterministic map interpreter — **emit** (canonical → X12) and **ingest** (X12 → canonical).
- Full X12 interchange envelope (ISA/GS/ST … SE/GE/IEA) + control numbers.
- Sell-side doc set: **850 / 855 / 856 (HL hierarchy) / 810 / 997** — all through one engine, no per-doc code.
- **Golden-file + property tested**; typecheck + test enforced via CI and local hooks.

## Develop

```bash
cd platform
npm install
npm test        # unit · golden · property
npm run start:dev
```

Quality/process charter: [`docs/design/quality-and-process.md`](docs/design/quality-and-process.md).
