# Engine Structure — recommended target (NestJS, fault-tolerant)

> Status: **DESIGN ONLY** — IP gate O2 still open. This is the target shape and a
> migration path, not an instruction to refactor now.
> Scope: the 6 doc types (850/855/856/810/846/997), inbound + outbound, multi-version,
> two delivery models (A: managed, B: EDI-as-API). See `delivery-models` thread
> and `saas-architecture-analysis.md`.

## 0. Two non-negotiables driving this design

1. **The four layers must stay separable** (envelope / map / engine / canonical) so
   that version, partner, tenant, and transport vary independently. NestJS modules +
   DI are chosen *because* they enforce that separation.
2. **Bad data must never crash a run.** The EDI ecosystem sends the same field as
   `"10"`, `10`, `"10.00"`, `"0010"`, `" 10 "`, `""`, `"N/A"`, or omits it. A single
   malformed element in transaction #37 of a 100-document batch must **quarantine #37
   and deliver the other 99** — never terminate the process. This is the dominant
   reliability requirement and shapes the whole error model (§4).

## 1. Why NestJS fits (and what stays)

- The four layers map 1:1 onto Nest **modules**; DI lets us inject a different
  transport (Model A vs B), a different version base, or a mock, without touching the
  engine. That *is* the separability we need.
- **Reuse, don't rewrite:** the Sequelize models (`x12Data`, `x12Job`,
  `x12ProcessLogs`, `client`, `configuration`, `x12Setting`, `ediStandard`) come
  across via `@nestjs/sequelize` — entities barely change. `node-x12` and the
  envelope template stay as an adapter behind the engine.
- What gets rebuilt is only the **glue**: the per-doc `utils/parser/edi*Parser.js`
  bodies (where partner quirks + data coercion + X12 structure are tangled) collapse
  into one generic engine + data maps.

## 2. Module decomposition

```
src/
  main.ts                       # bootstrap + global exception filter + ValidationPipe
  app.module.ts

  common/                       # cross-cutting, no domain knowledge
    coercion/                   # ★ THE fault-tolerance core (see §3)
      result.ts                 #   Result<T>, Diagnostic, DiagnosticBag
      coerce.ts                 #   toStr/toNum/toDecimal/toDate/toBool — TOTAL fns
    errors/
      global-exception.filter.ts#   nothing escapes as a crash / 500
      edi.error.ts
    logging/

  config/                       # @nestjs/config — env, delimiters, defaults

  canonical/                    # 🅓 LAYER — the public contract
    dto/                        #   per (docType,direction) DTOs (class-validator)
    schema/                     #   the JSON schemas already in docs/schema/canonical
    canonical.module.ts

  mapping/                      # 🅑 LAYER — maps as data
    map-loader.service.ts       #   load + JSON-schema-validate a map
    map-resolver.service.ts     #   version cascade: base ⊕ partner ⊕ overrides
    template-catalog.service.ts #   shared partner templates (the moat)
    maps/                       #   the map files (DB-backed later)
    mapping.module.ts

  engine/                       # 🅔 LAYER — ONE generic interpreter, all docs
    outbound/
      build.service.ts          #   canonical → segments (HL walk for 856)
      element-resolver.service.ts#  the DSL operators, ALL via common/coercion
    inbound/
      parse.service.ts          #   segments → canonical (HL tree rebuild)
      segment-matcher.service.ts#   `match` keys
    x12/x12.adapter.ts          #   wraps node-x12 + envelope emit
    engine.module.ts

  envelope/                     # 🅐 LAYER — ISA/GS framing
    control-number.service.ts   #   atomic sequence allocation
    envelope.module.ts

  transport/                    # CONNECTIVITY — pluggable, Model A only
    transport.interface.ts      #   send()/poll() contract
    sftp.adapter.ts  as2.adapter.ts
    transport.module.ts

  partners/                     # trading partner + relationship (version, mapRef, transportRef)
  tenants/                      # multi-tenant isolation + per-tenant secrets/vault
  transactions/                 # lifecycle: status, logs, 997 reconciliation, QUARANTINE/DLQ
    transaction.entity.ts       #   ← existing x12Data/x12Job/x12ProcessLogs
    reconciliation.service.ts
  api/                          # 🅑 MODEL B — REST/GraphQL: canonical in/out, webhooks, idempotency
  monitoring/                   # scorecards/dashboards (S4 — later)
```

**Key shape:** there is **no module per doc type.** A doc type is data (its canonical
schema + base map), not code — same principle as "partner = data." One engine serves
850/855/856/810/846/997. That keeps the "onboard with zero code" promise honest.

## 3. Data-type tolerance — the core robustness design

**Principle:** *Parse defensively, coerce explicitly, never throw on data. Reserve
exceptions for programmer errors (a malformed map), not for partner data.* Data
problems become **diagnostics that ride along**, not control flow.

Two patterns do the heavy lifting:

### (a) `Result` / `DiagnosticBag` instead of throwing

```ts
// common/coercion/result.ts
export type Severity = 'error' | 'warn' | 'info';
export interface Diagnostic {
  severity: Severity;
  code: string;                       // 'COERCE_NUM_FALLBACK', 'DATE_INVALID', …
  message: string;
  location?: { segment?: string; pos?: number; loop?: string; path?: string };
  raw?: unknown;
}
export class DiagnosticBag {
  readonly items: Diagnostic[] = [];
  add(d: Diagnostic) { this.items.push(d); return this; }
  get hasErrors() { return this.items.some(i => i.severity === 'error'); }
}
```

### (b) Total coercion functions — defined for *every* input, never throw

```ts
// common/coercion/coerce.ts
export function toStr(v: unknown, def = ''): string {
  if (v == null) return def;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return def;
}

export interface NumOpts { impliedDecimals?: number; default?: number | null; }
export function toNum(v: unknown, bag: DiagnosticBag, loc?: Diagnostic['location'], o: NumOpts = {}) {
  const def = o.default ?? null;
  const s = toStr(v);
  if (s === '') return def;                          // empty element → default, no noise
  const n = Number(s.replace(/,/g, ''));            // tolerate thousands separators
  if (!Number.isFinite(n)) {
    bag.add({ severity: 'warn', code: 'COERCE_NUM_FALLBACK',
              message: `non-numeric '${s}'`, location: loc, raw: v });
    return def;                                       // ← fall back, DON'T throw
  }
  return o.impliedDecimals ? n / 10 ** o.impliedDecimals : n;  // X12 N-type implied decimals
}

export function toDate(v: unknown, bag: DiagnosticBag, loc?) : string | null {
  const s = toStr(v);
  // accept CCYYMMDD (8) and YYMMDD (6); window 2-digit years; emit ISO
  // anything else → WARN + null, never throw
  ...
}
```

Every element binding in the engine's `element-resolver` goes through these — so a
qualifier field that arrives as a number, or a quantity that arrives as `"abc"`, can
**never** throw inside the walk. It degrades to a default plus a logged diagnostic.

### Strict at the API door, lenient at the partner door

| Boundary | Who controls the data | Policy |
|---|---|---|
| **Model B API ingress** (canonical in) | the **customer** | **Strict** — NestJS `ValidationPipe` + class-validator DTOs, reject with `400` + field errors. Fail fast; it's their bug to fix. |
| **Inbound EDI from a partner** | a **third party** you can't reject at the socket | **Lenient** — ingest, coerce, accumulate diagnostics, quarantine on hard error, emit 997/824. Never crash. |

This asymmetry is the EDI-maturity point: you *can* be strict with the party who can
fix it, but you must be forgiving with the party who can't.

## 4. Fault isolation — one bad doc never sinks the batch

```
processInterchange(raw):
  envelopes = split ISA/GS/ST  (tolerant splitter; malformed envelope → quarantine whole, TA1 reject)
  for each ST transaction:
    try:
      bag = new DiagnosticBag()
      canonical = engine.inbound.parse(transaction, map, bag)   # coercion fills bag, never throws
      if bag.hasErrors: quarantine(transaction, bag); ack.reject(this)   # 997 AK rejects ONLY this ST
      else:             persist(canonical); ack.accept(this)
    catch err:                                                   # truly unexpected
      quarantine(transaction, err); ack.reject(this); log.error
  emit 997 reflecting per-transaction accept/reject
```

- **Per-transaction try/catch** — isolation boundary is the ST, not the file.
- **Quarantine/DLQ table** holds raw bytes + diagnostics for replay (we already keep
  raw bytes per the SaaS analysis — round-trip is lossy and disputes are legal).
- **Global exception filter** (Nest) guarantees even an unforeseen throw becomes a
  logged, contained failure — process stays up.
- A 100-document group with one bad doc → **99 delivered, 1 quarantined, 997 rejects
  exactly that one.** That's the behavior the user mandated.

## 5. Where this leaves the operator DSL

The engine's `element-resolver` is just the DSL operators (path/const/default/format/
decimal/count/when/over/qualifier, plus the 856 `hl` node) — each implemented over
`common/coercion`, so the DSL is **tolerant by construction**. `path` that resolves
nothing → `default` or empty; `when` on a missing value → `false`; `decimal`/`format`
on garbage → fallback + diagnostic. No new operators needed for robustness.

## 6. Migration path (after IP clears) — strangler, not big-bang

1. Stand up the Nest skeleton with `common/coercion` + global filter first
   (robustness before features).
2. Wrap the **existing** 850 outbound flow as `engine` + one map; assert byte-identical
   output vs the current parser (golden file).
3. Port inbound 855/997; then 856 (HL); then 810/846.
4. Move transport behind the `transport` interface (enables Model B by simply not
   wiring it).
5. Retire each `edi*Parser.js` body + its boolean columns as its doc type is covered.

## 7. Open decisions this raises

- **DSL `Result` everywhere vs exceptions at boundaries only** — recommended: Result
  for data, exceptions for map/programmer errors. (leaning decided)
- **Quarantine storage** — new table vs extend `x12ProcessLogs`. (open)
- **Model B map authoring** — we-author-templates vs client-override (carried from
  delivery-models thread). (open)
