# Hardening & Review Phase

**Status: ACTIVE (opened 2026-08-04).** The build is *parked* — feature development is paused. This
phase reviews everything built so far, down to individual lines and features, to make the app solid and
robust before further feature work.

This directory is the **dedicated context for the hardening phase**. It exists so review/testing activity
does **not** pollute the original decision log (`docs/context.md`, D1–D94). Keep the two separate:

- `docs/context.md` — the **feature decision log**. During hardening it is a **frozen reference**: read it
  to validate changes; do **not** append feature decisions to it. (A hardening action that changes designed
  behavior is a red flag — see Rule 4.)
- `docs/hardening/findings-log.md` — the **running ledger** of this phase: every finding, its validation
  against the frozen docs, the decision (fix / won't-fix / defer), and the resolution + test. All hardening
  narrative goes here.
- `docs/hardening/README.md` (this file) — the charter: baseline, rules, methodology, module tracker.

## Baseline snapshot (the "known-good" we harden from)

| | |
|---|---|
| Commit | `caaa432` (branch `main`, github.com/PankajMore024/edi-platform) |
| Tests | **247 passing**, 49 spec files; `tsc --noEmit` clean; console `npm run build` clean |
| Backend | NestJS/TS in `platform/` — 112 source files across 14 modules |
| Frontend | React/Vite in `console/` — 12 views |
| Guardrails | jest + fast-check + decimal.js; golden round-trips; PostToolUse tsc hook; Stop-hook test run; CI |

## Golden rules for this phase (the validation discipline)

1. **context.md is frozen.** No new feature decisions there during hardening. Read it to check intent.
2. **All findings + fixes are logged in `findings-log.md`**, not context.md. One entry per finding (Hn).
3. **Validate every change against the frozen docs first.** Before any append/addition/deletion, cite the
   decision (Dn) or design doc it must be consistent with. A change that *contradicts* a documented decision
   is a finding to raise — not a silent edit. If the doc is wrong, that itself is a finding (fix the doc,
   note why).
4. **No new features.** This phase is correctness, robustness, edge-cases, error-handling, security/tenant
   isolation, test coverage, and doc accuracy — nothing else. Scope creep is a finding, not an action.
5. **Every behavioral fix ships with a test** that fails before and passes after. No fix without a regression
   guard. Money/EDI-correctness fixes get a property or golden test where applicable.
6. **Stay green.** Run the full suite + `tsc` after each change; a red baseline blocks further work.
7. **Deletions require proof.** Grep for callers/refs; confirm the code contradicts no decision; log the
   justification. Never delete something described in the docs without reconciling the doc.
8. **Adversarial verification.** Use `/code-review` (high) per module/diff; try to *refute* each finding
   before acting on it. Record CONFIRMED vs PLAUSIBLE in the log.

## Methodology

Module-by-module passes. For each module: read every source + spec line; run the finder angles
(line-by-line correctness, removed-behavior, cross-file, reuse, simplification, efficiency, altitude,
conventions); check tenant isolation + error paths + edge cases; assess test coverage; verify the docs
still describe reality. Log findings, verify them, fix with tests, keep green, update the tracker.

## Module review tracker

Legend: ☐ pending · ◐ in review · ☑ hardened (reviewed + gaps closed + green)

### Backend (`platform/src/`)
| Module | Area | Status |
|---|---|---|
| `x12` | codec (parse/serialize) | ☐ |
| `mapping` | DSL types, engine (emit/ingest/coerce/format/path/predicate), map-validator | ☐ |
| `canonical` | document + common types | ☐ |
| `envelope` | ISA/GS/ST envelope + control numbers | ☐ |
| `validation` | conformance-validator, specs, correlation | ☐ |
| `connectors` | SDK, object-mapper, adapters, sample-profiler | ☐ |
| `transport` | adapters (sftp/webhook stubs), registry | ☐ |
| `intake` | gateway, raw-artifact/dedup/ledger stores | ☐ |
| `control-plane` | registries, pipelines, orchestrator, quarantine, config-loader | ☐ |
| `ack` | functional-ack (997) | ☐ |
| `certification` | service, controller, suggestion, reference-templates | ☐ |
| `db` | schema, migrations, repositories, dialect | ☐ |
| `api` | controllers, guards (PrincipalGuard), auth, decorators | ☐ |
| `app.module` / `main` | bootstrap, DI graph, CORS, pipes | ☐ |
| cross-cutting | tenant isolation, error handling, money/decimal, async correctness | ☐ |

### Frontend (`console/src/`)
| Area | Status |
|---|---|
| `api.ts` client + auth/token handling | ☐ |
| `App.tsx` shell / login / role-nav | ☐ |
| views (Certification, Partners, Library, Catalog, Documents, Review, forms, wizards) | ☐ |
| build/type strictness, error surfaces | ☐ |

## Deferred / known-stub inventory (validate these are honestly gated, not silently broken)

- Live transport drain of `dispatch_queue` (SFTP/webhook are descriptor+config real, pull/push throw `TransportNotConfiguredError`) — credential-gated.
- Live model calls at the two AI seams (suggestion engine + sample synth are deterministic today).
- AI auto-mapping (IG → EdiMap draft) — not built.
- Multi-order 856 ingest needs HL-level `match` rules (single-order works).
- Config read-cache auto-hydrate trigger; strict DTO validation on some write endpoints.

Exit criteria: every backend module ☑, every frontend area ☑, findings-log resolved or explicitly
deferred, full suite green, and the deferred inventory confirmed as honest gates (no silent failure).
