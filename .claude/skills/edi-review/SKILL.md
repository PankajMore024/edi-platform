---
name: edi-review
description: Domain review checklist for EDI engine, map, and connector changes. Invoke when reviewing or before committing any diff under platform/ that touches the translation engine, a partner map, a connector, canonical types, envelope/control-number logic, or financial value handling. Catches the EDI-specific bug classes that cost real money.
---

# EDI Review

Review the change against this domain checklist. For a financial-critical EDI system, a passing
typecheck and green tests are necessary but NOT sufficient — walk every item that the diff touches.
Report findings ranked by financial/correctness risk. When in doubt, treat it as a defect.

## 1. Financial values (highest risk)
- Money uses `decimal.js` / integer minor units — **never float math**. Rounding is explicit
  (`ROUND_HALF_UP`) and tested.
- `decimal` scaling comes from the map, not a guess. No silent truncation of precision.
- Quantities, unit prices, totals, and hash totals (CTT/TDS/SE/GE) are computed by the engine and
  covered by a golden test.

## 2. Control numbers & idempotency
- ISA13 / GS06 / ST02 are allocated atomically — no duplicates, no races.
- Every document has an idempotency key; reprocessing the same input is safe.

## 3. Dates & time
- Formatted deterministically in UTC (CCYYMMDD / YYMMDD / HHMM / HHMMSS). No local-time ambiguity.

## 4. Structure & cardinality
- Segment/element positions and required elements match the map/IG; cardinality respected
  (repeats via `over`, occurrence via `match`).
- No hardcoded partner logic in engine code — variation lives in the map (config, not code).

## 5. Inbound safety
- Unmapped segments/elements are **captured** (`inbound.unmapped`), never silently dropped.
- Raw bytes are retained before any transformation.

## 6. Failure behavior
- Invalid input throws or is rejected — never silently coerced.
- Errors say what failed and where (segment/element), usable by the sandbox report + agent.

## 7. Tests & determinism
- A golden test exists/updates for any affected (partner, docType, direction, version).
- Property invariants hold: round-trip preserves meaning; no data loss; numeric precision preserved.
- Output is deterministic (no `Date.now()`/random in the translation path).

## 8. Multi-tenancy & secrets
- Every new table/query is tenant-scoped (`tenant_id`).
- Credentials resolve from the vault, never from config tables or code.

Output: a ranked list of findings (file:line, the risk, the fix). If nothing is wrong on an item,
don't pad the report — only surface real issues.
