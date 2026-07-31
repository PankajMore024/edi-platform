# Development & Quality Charter

> How we build an EDI platform where a bug means real financial loss. The governing principle:
> **don't rely on the chat, the model, or any single agent to be careful — enforce correctness
> mechanically.** The chat drives the work; layered guardrails catch mistakes regardless of who
> made them. 2026-07-31.

---

## The principle

A chat window (or any AI agent, or any human) is fallible and has no memory guarantee. So we do
**not** make correctness depend on anyone remembering to be careful. Instead:

- **Determinism + golden files** prove the output is exactly what a partner expects.
- **Hooks / CI** make tests non-optional — broken code cannot land.
- **Validation layers** reject bad data at every boundary before it moves.
- **Human approval gates** authorize anything touching money or a live partner.
- **Immutable raw + replay** let us reproduce and recover if something slips through.

Skills encode the *procedure*; hooks/CI *enforce* it; tests *prove* it; human gates *authorize*
the risky steps. Robustness is the **stack**, not any one tool.

---

## The robustness stack (what each layer catches)

| Layer | Practice | Catches |
|---|---|---|
| **1. Determinism + golden files** | Every (partner, docType, direction, version) map has a golden test: input → exact expected output. | Any change that alters a live partner's output — the #1 EDI regression. |
| **2. Property-based tests** | Round-trip (X12→canonical→X12 preserves meaning), no-data-loss (unmapped captured), numeric precision preserved. | Edge cases nobody thought to write a case for. |
| **3. Boundary validation** | TS types + runtime schema (ajv/class-validator) at every edge; validate maps at load, canonical at build, inbound X12 vs IG. | Malformed data, silent coercion, structural drift. |
| **4. Two-layer business validation** | Syntactic (vs IG) **and** business/compliance (qty>0, price sanity, ASN↔PO match) **before transmit**. | Valid-EDI-but-wrong-data (the data-quality trap). |
| **5. Financial-correctness rules** | See below — decimals, rounding, dates, control numbers, idempotency. | The classic money bugs. |
| **6. Mechanical enforcement** | Hooks + CI: typecheck + lint + unit + golden + property tests gate **every** change. | Anything broken landing at all. |
| **7. Independent review** | A separate agent / `/code-review` at high effort reviews critical diffs with fresh eyes; workflow audits at phase gates. | Logic errors the author (human or AI) is blind to. |
| **8. Sandbox certification + human gate** | No map goes live without passing sandbox vs golden + a human approval; immutable published versions, pinned, staged rollout. | Un-vetted changes reaching a real partner. |
| **9. Immutable raw + audit + replay** | Keep every byte; every step is an event; reprocess on demand. | Un-diagnosable incidents; dispute/forensic gaps. |
| **10. Observability + alerting** | Missing acks, volume anomalies, validation-failure spikes alert in prod. | Silent failures becoming losses. |

---

## Financial-correctness rules (the money-bug classes — call these out explicitly)

- **Never use floats for money.** Integer minor units or a decimal library. Explicit, tested rounding.
- **Decimal scaling per element** is data in the map (`decimal`), never guessed.
- **Dates & timezones** normalized deterministically (CCYYMMDD/HHMM); no local-time ambiguity.
- **Control numbers (ISA13/GS06/ST02)** allocated atomically — no duplicates, no races. Idempotency keys on every document.
- **Quantities/UOM** cross-referenced, never assumed; qty and price sanity-checked before transmit.
- **Totals & hash totals (CTT/TDS/SE/GE)** computed by the engine, golden-tested.
- **Exact byte preservation** of received artifacts (audit/dispute/legal).

---

## How Claude Code mechanisms map to the stack

| Mechanism | Role |
|---|---|
| **Custom skills** | Encode repeatable *procedures/checklists* (see below) so they're applied consistently every session. |
| **Hooks** (`settings.json`) | *Enforce* — run typecheck/tests/lint automatically after edits; block on failure. The harness runs these, not the model. |
| **CI pipeline** | The same gates on every commit/PR — the backstop hooks can't skip. |
| **Subagents** (`/code-review`, code-reviewer) | Independent, fresh-eyes review of critical diffs (adversarial verification). |
| **Workflows** (opt-in) | Multi-agent audits at phase gates — fan out over correctness/edge/financial/security, verify each finding. |
| **`/verify`** | Actually exercise a flow end-to-end and observe behavior, not just run tests. |
| **`/security-review`** | The partner-facing + credential surfaces (transport, connectors, secrets). |
| **Plan mode** | Review the approach *before* coding anything nontrivial. |
| **Memory + this docs/ tree** | Persist invariants/decisions so nothing drifts across sessions. |

---

## Recommended custom skills to craft (procedures for the critical pieces)

- **`map-authoring`** — the checklist for creating/changing a partner map: required elements,
  qualifier handling, `decimal`/date formats, a golden file is mandatory, run the validator.
- **`connector-authoring`** — the contract a connector must satisfy: auth via vault, idempotency,
  sandbox mode, connector-map, tests.
- **`canonical-change`** — governance for touching the canonical schema: additive-only, versioned,
  migration plan, the "does this belong in a map instead?" smell test.
- **`edi-review`** — a domain review checklist run on any engine/map diff: control numbers, decimals,
  dates/timezones, segment cardinality, unmapped capture, financial fields.
- **`promotion`** — the certification checklist before a map/connector goes live.

---

## Recommended hooks / CI gates

- On file change: `tsc --noEmit` + affected tests.
- Pre-commit / CI: full typecheck + lint + unit + **golden** + **property** tests; block on any failure.
- On any `*.map.json` change: run the map JSON-schema validator + that map's golden test.
- Block a commit that reduces test coverage on the engine.

---

## The lifecycle of a change (with gates)

```
idea → PLAN (plan mode, reviewed)
     → BUILD (skill-guided)
     → TEST (golden + property + unit; hooks enforce)  ── fail ──▶ back to build
     → INDEPENDENT REVIEW (/code-review high, or a subagent)
     → SANDBOX CERTIFICATION (vs golden + partner samples)
     → HUMAN APPROVAL (anything touching money/a live partner)
     → STAGED ROLLOUT → PROD (immutable, pinned, observable)
```

No step touching a live partner skips review, certification, and human approval.

---

## What to set up FIRST (safety scaffolding before the engine)

Build the harness before the thing it protects:

1. **Golden-file + property test harness** in `platform/` (Phase 1 exit criteria anyway).
2. **Hooks** for typecheck + test on change (via the `update-config` skill).
3. **The `edi-review` skill** so every engine/map diff gets the domain checklist.
4. (At the first PR) a **CI workflow** running the full gate.

Then implement the engine *into* this harness — every line is born tested and reviewed.
