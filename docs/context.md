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

### 2026-08-03 — Phase 3: config write path complete [API slice 3]

- **D79. The full config graph is now provisionable over HTTP.** Added the remaining provisioning
  controllers: `SpecsController` (GET list/:id, PUT :id → DocSpecRepository — the specId that
  relationship documents reference), `PartnerMapsController` (partner X12⇄canonical maps — the mapId
  referenced by relationship documents), `TransportsController` (SFTP/webhook instances). Added `list`
  to PartnerMapRepository + TransportInstanceRepository. With relationships (D77) + connector instances
  (D78) + specs + partner-maps + transports, **every config object a relationship binds is now
  API-creatable** — the provisioning write path is complete end-to-end. e2e: spec/partner-map/transport
  PUT→GET round-trips + list + 404. 194 tests green (stable ×3), build clean. **Remaining for a live
  console:** wire import-sample output → a saved ConnectorMap on an instance (achievable now via
  PUT /connectors/:id with the built map — no new endpoint needed); config read-cache (so the translate
  hot path reads API-provisioned config); auth + strict DTOs; then the React console against these
  endpoints. G1 (engine multi-doc split) still open.

### 2026-08-03 — Phase 3: sample-import profiler + connector-instance provisioning [API slice 2]

- **D78. Sample-import profiler (G2 resolved) + connector-instance provisioning.** Built the
  deterministic profiler as real backend (`connectors/sample-profiler.ts`, ported from the console
  prototype): `profileSample({type,sample,docType})` parses a CSV (via csv-parse) or JSON payload,
  infers per-field type, detects header-vs-line + the document key + doc count (multi-order files, G1
  signal), and auto-suggests canonical bindings by name/synonym. **Fixed a real detection gap** a test
  caught: with one row per document the "constant-within-group" heuristic can't tell header from line,
  so line-ness now comes from the canonical suggestion (which knows sku/qty are line fields), falling
  back to structural — CSV; JSON structure (array vs scalar) stays definitive. `ConnectorInstanceRepository`
  (deferred from slice 3): persists the instance scalars in `connector_instance` + its map in
  `connector_map` (rewritten on save), docTypes derived on read — where sample-import output lands as
  reusable master config. `ConnectorsController`: GET/PUT instances + `POST /connectors/import-sample`
  → profiler. e2e: import-sample suggests poNumber/lines[].sku from a CSV (+ 400 on bad input),
  instance PUT→GET round-trip. Profiler unit tests: multi-order CSV (docKey/docCount/types/suggestions),
  JSON (array→line, unmatched flagged), 810 fields. 193 tests green (stable ×3), build clean. **G2 done**
  (profiler + endpoint); **G1 still open** (engine grouping of a multi-doc file into N canonical docs —
  the profiler now DETECTS it, the ingest split is the remaining work). **Remaining API:** map/spec
  provisioning endpoints, wiring import-sample output → a saved ConnectorMap, config read-cache, auth,
  strict DTOs. Then the React console.

### 2026-08-02 — Phase 3: provisioning API / console backend [API slice 1]

- **D77. HTTP API over the control plane.** First slice of the console/provisioning backend (NestJS
  controllers under `/api`, global ValidationPipe, `@Tenant()` param decorator reading `x-tenant-id` —
  every endpoint tenant-scoped; JWT/API-key auth is a follow-up). Endpoints: `CatalogController` (GET
  /catalog[/connectors|/transports] from the registries), `RelationshipsController` (GET list/:id, PUT
  :id → persists via RelationshipRepository — the provisioning write path + first live consumer of the
  config repos), `DocumentsController` (GET /documents list + /:id detail from the normalized
  transaction rows, /timeline/:dedupKey from the ledger — the Operate read model), `ReviewController`
  (GET /review queue, POST /:id/dismiss, POST /:id/reprocess → QuarantineResolver, loading the rel from
  RelationshipRepository). `ApiModule` wired into AppModule; repos from @Global DatabaseModule. e2e
  tests with supertest boot the full app on node:sqlite: catalog (7 connectors/2 transports),
  relationship PUT→GET round-trip + tenant isolation + 404, documents served from persisted rows,
  review queue + dismiss. 189 tests green (stable ×3), build clean. **Deferred:** connector-instance /
  map / spec provisioning endpoints (connector-instance needs its repo), the **sample-import endpoint**
  (profiler G2), auth, and the **config read-cache** — now that the API persists config to the DB, the
  cache is the bridge so the translate hot path reads API-written config (pairs with a future
  receive/trigger endpoint, since the pipeline isn't HTTP-triggered yet). Body validation is currently
  loose (TradingRelationship shape); strict DTOs are a follow-up.

### 2026-08-02 — Phase 2: interchange + ack/delivery/dispatch persistence [DB slice 4b]

- **D76. The full inbound lifecycle now persists.** Added `LifecycleSink` (abstract; `InMemory` for
  tests, `DbLifecycleSink` for the DB) bundling the pipeline's write-side records — its single producer.
  `InboundPipeline.processInterchange` now: creates the `interchange` row (ISA13 + sender/receiver +
  dedup key + status), links every transaction + processing-event to it (`interchange_id`), persists
  each generated **997 → `acknowledgment`** (control #, group #, edi, AK9 summary) and **enqueues it on
  `dispatch_queue`** (status `pending` — the outbound transport send is the deferred live step), and
  records a **`delivery`** row for each document that reached the customer connector (payload; Buffer→
  base64). Wired via IntakeModule (`LifecycleSink` → DbLifecycleSink). DB test asserts all four row
  types (interchange/acknowledgment/delivery/dispatch_queue) land on an accept, alongside the
  transaction. 185 tests green (stable ×3), build clean. **The inbound lifecycle plane is now fully
  durable** (retention · dedup · interchange · transaction+children · processing events · 997 · delivery
  · dispatch queue). **Deferred:** outbound-transaction persistence (+ G1 grouping); the actual
  transport drain of dispatch_queue (credential-dependent); interchange rows for the duplicate/conflict
  short-circuit (they keep artifact_id + dedup_key on the event). Config read-cache still pairs with the
  provisioning API — the natural next milestone.

### 2026-08-02 — Phase 2: transaction persistence — canonical ⇄ normalized rows [DB slice 4]

- **D75. The pipeline now persists each processed transaction as NORMALIZED rows (no blob).** Added
  `TransactionStore` (abstract; `InMemoryTransactionStore` for unit tests, `TransactionRepository` for
  the DB) with `save`/`get`/`list`. On save, the canonical document is SHREDDED into the class-table-
  inheritance rows: `transaction` header (promoted po_number/line_count/lifecycle timestamps + state) +
  per-doc-type subtype (`transaction_810` invoice, `transaction_855` ack, `transaction_856` shipment,
  `transaction_850`) + `transaction_line` + `transaction_line_identifier` (qualified product ids) +
  per-doc-type line subtypes (855 ack status) + `transaction_party`/`_reference`/`_date` — all in one DB
  transaction, amounts as exact decimal text. `get` RECONSTRUCTS the canonical from the rows (for
  re-emit — no primary blob). `InboundPipeline` persists every transaction (accepted → DELIVERED,
  rejected → REJECTED with reason — a bad doc is stored too, queryable for review) and links
  `processing_event.transactionId`. Wired via IntakeModule (`TransactionStore` → TransactionRepository).
  Tests: end-to-end DB persistence + reconstruction on 850 through the live pipeline (poNumber/lines/qty/
  price/ids), + direct repo round-trips for 810 (invoice subtype + total), 855 (line ack subtype),
  850 (parties + references), + REJECTED-doc persistence + `list` by state. 185 tests green (stable ×3),
  build clean. Fixed: unqualified line ids (value-only, no type) violated the identifier NOT NULL — now
  skipped (captured by the promoted `sku` column). **Deferred to slice 4b:** interchange row +
  acknowledgment/delivery/dispatch persistence; outbound-transaction persistence (+ G1 grouping). The
  lifecycle plane is now substantially persisted; config read-cache still pairs with the provisioning API.

### 2026-08-02 — Phase 2: durable control numbers wired into the live pipeline [DB slice 3b]

- **D74. ControlNumberService made async + tenant-scoped; durable ControlNumberRepository wired into
  the running pipeline.** Refactored `ControlNumberService` → abstract async `(tenantId, scope)` +
  `InMemoryControlNumberService` (unit tests). `ControlNumberRepository` now `extends` it; `EnvelopeModule`
  binds the token to the durable repo (`useExisting`, from @Global DatabaseModule) — so the app allocates
  ISA13/GS06/ST02 **atomically from the DB, surviving restarts** (the flagged EDI-incident risk, fixed in
  the live path). Threaded `rel.tenantId` into every allocation; `TranslationPipeline.emitDocument` +
  `InboundPipeline.buildGroupAck` are now async (small ripple: orchestrator `Promise.all`, spec awaits +
  `rejects.toThrow`). App boots with the durable allocator wired. 181 tests green (stable ×3), build clean.
  **Deferred (with rationale):** the config READ-CACHE (hydrating MapRegistry/SpecRegistry/
  ConnectorInstanceStore from the config repos) — there's no live producer/consumer yet (no provisioning
  API, transport stubbed), so building cache+invalidation now would be untested speculative machinery.
  It pairs naturally with the provisioning API (Phase 3 console backend). **Slice 4 next:** persist the
  `transaction` header+subtype+line rows + acks/delivery/dispatch, reconstruct canonical for emit.

### 2026-08-02 — Phase 2: durable config repositories + atomic control numbers [DB slice 3]

- **D73. Config-plane persistence — repositories for master config + atomic control numbers.**
  Built durable Kysely repos for the config plane: `ControlNumberRepository` (atomic, per-(tenant,scope)
  allocation via a transactional upsert-increment — replaces the in-memory ControlNumberService whose
  non-atomic/non-persistent allocation is a top real-world EDI incident; tested for monotonicity +
  **20-way concurrent allocation with zero duplicates**), `RelationshipRepository` (the central object —
  `trading_relationship` header with envelope-as-JSON + `relationship_document` children rewritten
  atomically on save; round-trips the full aggregate, tenant-scoped, no orphans on update), and the flat
  config repos `DocSpecRepository` / `PartnerMapRepository` / `ConnectorMapRepository` /
  `TransportInstanceRepository` (promoted lookup columns + full object as JSON `definition`, verbatim
  round-trip; connector-map has `listForConnector` for the reused-across-partners library view — this is
  where sample-import output persists). All provided/exported by DatabaseModule. 181 tests green
  (stable ×3), build clean. **This is storage (repos + tests), not yet hot-path-wired** — the config
  registries used by TranslationPipeline (`MapRegistry`/`SpecRegistry`/`ConnectorInstanceStore`) are
  still in-memory. **Slice 3b (next):** wire config through a load/cache layer (config is read-heavy;
  a sync in-memory cache loaded from these repos avoids an async ripple through the translate hot path)
  + swap in the durable ControlNumberRepository (async — small ripple on emit). **Slice 4:** persist the
  `transaction` header+subtype+line rows + acks/delivery/dispatch, reconstruct canonical for emit.
  G1/G2/G4 still open.

### 2026-08-02 — Phase 2: DB repos wired into the live pipeline [DB slice 2]

- **D72. Intake stores converged to async + multi-tenant; durable repos swapped into the pipeline.**
  Made the intake store interfaces (`RawArtifactStore`, `DedupStore`, `ProcessingLedger`) **async +
  tenant-scoped** (`put(tenantId,…)`, `register(tenantId,…)`, `timeline(tenantId,dedupKey)`, etc.) —
  required for a real DB backend. In-memory impls updated (tenant-composite keys, async). The Kysely
  repos now `extend` these abstract classes, so DI binds the abstract token to the durable repo:
  `IntakeModule` uses `{ provide: RawArtifactStore, useExisting: RawArtifactRepository }` (repos from
  the @Global DatabaseModule) → **the running app persists to Postgres/sqlite**. Threaded `tenantId`
  through `InboundGateway.receive(tenantId,…)` (from `rel.tenantId`) and awaited the async ledger/gateway
  in `InboundPipeline` + `QuarantineResolver` (dismiss/queue/requireOpen now async). Ripple was
  mechanical; updated the gateway/ledger/pipeline/resolver specs (unit tests keep constructing in-memory
  impls directly against the same async contract). Added a **DB integration test**
  (`inbound-pipeline.db.spec.ts`) running the live pipeline on real sqlite repos — proves retention +
  dedup + the lifecycle event persist to the DB (accept → event row + retrievable artifact; duplicate/
  conflict → timeline + review queue). A per-tenant-isolation gateway test confirms two tenants with
  identical bytes are independent. 176 tests green (stable ×3), build clean, app graph boots with the
  DB-backed pipeline. **Remaining DB slices:** (3) config-plane repos + atomic durable control numbers
  behind refactored config stores; (4) persist the `transaction` header+subtype+line rows + acks/
  delivery/dispatch, reconstruct canonical from rows for emit. G1/G2/G4 still open.

### 2026-08-02 — Phase 2: persistence foundation (Kysely + Postgres/sqlite) [DB slice 1]

- **D71. DB layer foundation + full schema + durable lifecycle repositories.** Chose **Kysely** (query
  builder, explicit, no decorator magic — fits the codebase) over Prisma/TypeORM; **Postgres** in prod
  (via `DATABASE_URL`), **node:sqlite** for tests (Node 26 built-in — zero native build, runs in CI).
  Wrote a minimal Kysely dialect over `node:sqlite` (`db/node-sqlite.dialect.ts`) + ambient types
  (`@types/node@20` predates node:sqlite). **Full schema designed + committed** (`db/schema.ts` typed
  rows, `db/migrations.ts` idempotent `createSchema`) across BOTH planes: CONFIG (tenant, trading_
  partner, trading_relationship, relationship_document, connector_instance, connector_map, partner_map,
  doc_spec, transport_instance, control_number_seq, config_audit) and LIFECYCLE (raw_artifact,
  dedup_ledger, interchange, transaction, transaction_line, transaction_party, transaction_reference,
  transaction_date, transaction_event, processing_event, conformance_issue, acknowledgment, delivery,
  dispatch_queue) — 31 tables incl. the doc-type subtypes below. Portable types (text/integer; bool
  0/1, ts as text) so identical DDL runs on pg + sqlite.
  **Transaction content uses CLASS-TABLE INHERITANCE, not a JSON blob and not per-doc-type mega-tables**
  (revised twice from user feedback — first "no blob" [blob can't be indexed for dashboards/ops, status
  changes rewrite it], then "no sparse all-doc-types-in-one-table"). Analyzed the user's legacy schema
  (`models/kon_*lists`: per-doc-type tables = repeated common cols + promoted keys + X12 segments as
  JSON columns). Final model: **`transaction` = shared SUPERTYPE** (only fields common to every doc
  type: control numbers, po_number, status/reason, line_count, lifecycle timestamps + current_state);
  **`transaction_<doc>` = per-doc-type header SUBTYPE** 1:1 by transaction_id (only that type's fields —
  `transaction_810` invoice_number/date/total/tax/terms, `transaction_856` shipment/carrier/tracking/
  weight, `transaction_855` ack, `transaction_850` beg fields); **generic recurring children**
  (`transaction_line`, `transaction_party` [N1], `transaction_reference` [REF], `transaction_date`
  [DTM]) shared across doc types; **per-doc-type LINE subtypes** (`transaction_line_856` ship/pack,
  `transaction_line_855` item-ack) 1:1 with a line row where a type adds line-level fields. No sparse
  columns, no duplicated common columns, unified cross-type dashboards (query the supertype), still
  multi-tenant (tenant_id, not per-tenant tables). 997/FA → `acknowledgment` + `conformance_issue`
  (not a business transaction). FK constraints + ON DELETE CASCADE throughout; amounts/quantities as
  TEXT decimal (no float money); no JSON blob on the query path. Lifecycle = column updates +
  append-only event rows. 31 tables total. `DatabaseModule` (@Global) provides the Kysely conn + repos, bootstraps schema on init; wired
  into AppModule (boots on sqlite in the app-graph test). Implemented 3 durable, multi-tenant,
  async repositories mirroring the in-memory intake contracts: `RawArtifactRepository` (content-
  addressed, first-write-wins via ON CONFLICT DO NOTHING), `DedupRepository` (atomic upsert increment),
  `ProcessingRepository` (record/get/list/timeline/needingReview/resolve). Jest: whitelisted kysely
  (ESM-only) for ts-jest transform (allowJs). **A repeat-run flake caught a real ordering bug** —
  processing events ordered by ms-precision `created_at` tied and reshuffled the audit timeline (id
  tiebreak is a random uuid); fixed with a per-instance strictly-increasing stamp. 173 tests green
  (stable ×4), build clean. Added `transactionId?`/`interchangeId?` to ProcessingRecord (forward link).
  **This is SLICE 1 (foundation, standalone repos not yet wired into the live pipeline).** Next slices:
  (2) converge intake to async + swap DB repos into InboundGateway/pipeline; (3) config-plane repos +
  atomic control numbers behind refactored stores; (4) transaction repository — persist header +
  line/party/reference/date rows + acks/delivery/dispatch, reconstruct canonical from the normalized
  rows for emit (no primary blob). Addresses backlog G3 (config) partly + the lifecycle-storage ask;
  G1/G2 still open.

### Tracked gaps / backlog (not yet built)

- **G1. Multi-document grouping on the connector edge.** `ObjectMapper.ingest` treats a whole native
  payload as ONE canonical document (header from row 1 / the object; every row → one line array). A
  real client export (e.g. a NetSuite CSV of a day's POs) contains MANY documents in one file,
  distinguished by a **document key** column (e.g. `PO_Number`). Needed: (a) the sample-import
  profiler surfaces/detects the grouping key, (b) the engine splits a multi-doc payload into N
  canonical documents grouped by that key (mirrors the multi-TS split we did on the partner edge in
  D70). Until then, multi-order files collapse into one giant doc. Contained, credential-free; do
  before real connector-edge go-live. Surfaced while designing the sample-import → mapping flow (admin
  console).
- **G2. Sample-import schema profiler.** ✅ RESOLVED (D78) — `connectors/sample-profiler.ts` + `POST /api/connectors/import-sample`. The console needs a deterministic profiler that takes a
  client sample (CSV/xlsx via existing parsers, or JSON/DB rowset), infers fields + types + header-vs-
  line structure + the doc key (G1), and auto-suggests bindings to canonical (name/synonym/type match;
  AI improves suggestions later). Output = a `ConnectorMap` saved to the library keyed by
  `(connector, docType)`. Prototyped in the console artifact; backend not yet built.
- **G3. Durable, versioned master-config persistence.** The control-plane config objects
  (TradingRelationship, ConnectorInstance + ConnectorMap, DocSpec, TransportInstance) ARE the master
  config a client↔partner setup — the runtime reads only from them — but today they live in in-memory
  stores (`RelationshipStore`, `ConnectorInstanceStore`, `MapRegistry`, `SpecRegistry`, transport
  registry), so a restart loses everything. Needed: swap a durable DB impl behind the existing store
  interfaces (same seam pattern as the intake stores), plus (a) tenant-scoped isolation, (b) versioning
  + audit trail on every config change (who/when — config changes move money), (c) environment split
  (sandbox vs production copies with promotion). The connector map is client-level master config
  (reused across partners); the relationship + bindings are the per-client↔partner master config. The
  imported SAMPLE is input, not config — the generated ConnectorMap is what's stored. Surfaced while
  building the sample-import/provisioning flow.

### 2026-08-02 — Phase 2: multi-group / multi-TS interchanges (batched, end-to-end)

- **D70. Batched interchanges handled per transaction set, with one 997 per group.** The old
  single-group `parseInterchange` merged ALL non-envelope segments into one body — a batched
  interchange (many STs, possibly many GSs) was silently garbled and only one TS acknowledged (a real
  correctness gap). Added `EnvelopeService.parseGroups` — hierarchical walk ISA→[GS→[ST…SE]*→GE]*→IEA
  returning `ParsedInterchange{ groups[]: { functionalId, groupControlNumber, transactionSets[]: {
  code, controlNumber, body } } }`; each set's body is the segments between ST and SE. Kept
  `parseInterchange` (single) for the existing convenience callers. `TranslationPipeline.ingestBody(
  rel, docType, body)` extracted as the per-set translate+validate primitive (ingestDocument now
  delegates to it). `InboundPipeline` rewritten: iterate every group & set, translate/validate/deliver
  each independently, emit **one 997 per functional group** (AK2/AK5 per set, AK9 A/P/R with real
  counts), and write **one ProcessingRecord per transaction set** (carrying functionalGroup +
  transaction control numbers) so each document in a batch has its own lifecycle/review status.
  `InboundResult` reshaped: `transactions[]` (per set) + `acks[]` (per group); `event` now only for the
  duplicate/conflict short-circuit. Interchange-level `outcome` = accepted iff every set conformant.
  **Reprocess is now precise:** a per-TS review event re-runs ONLY that set (siblings untouched → no
  double-delivery); an interchange-level conflict re-runs the whole interchange (operator explicitly
  superseding). QuarantineResolver links resolution to `transactions[0].event`. Tests: multi-TS
  single-group (partial 997 P 2/2/1, only the good set delivered), multi-group (one 997 per group),
  per-set distinct lifecycle events sharing one artifact, plus the reshaped accepted/rejected/
  duplicate/conflict + resolver cases. 166 tests green (stable ×3), build clean. **Remaining before
  fully live:** transport dispatch of the 997s (credential-dependent); TA1 interchange-level ack.

### 2026-08-02 — Phase 2: quarantine-resolution worker (closes the human loop)

- **D69. `QuarantineResolver` — operator actions on the review queue.** Completes D68a: the ledger
  surfaced conflicts/rejects for review; this lets an operator ACT on them, audited. Actions:
  `queue(tenantId)` (open items = needsReview && not resolved), `dismiss(eventId, by, note, at)`
  (close without processing — nothing delivered), `reprocess(rel, eventId, by, note, at)` (re-run the
  RETAINED bytes through the pipeline, **bypassing dedup**, and deliver+ack if now conformant).
  Refactored `InboundPipeline`: extracted an intake-agnostic `process(rel, ctx, ts)` core shared by
  `receive()` (fresh intake) and the new `reprocess(rel, artifact, originalEvent, at)`; `receipt` is
  now optional on `InboundResult` (a reprocess has no new intake). Ledger gains resolution stamping:
  `resolve(id, patch)` sets resolution/resolvedAt/resolvedBy/resolutionNote/resolutionEventId;
  `needingReview` now excludes resolved items. Reprocess links the review event to the NEW processing
  event (`resolutionEventId`); if the re-run is still non-conformant it's rejected again and the new
  reject re-enters the queue (original stays resolved). Guards: unknown / non-review / already-resolved
  events throw. 6 resolver tests (queue, dismiss, conflict→reprocess→accepted+delivered, still-invalid
  reprocess, guards). 166 tests green (stable ×3), build clean. **Remaining before this loop is fully
  live:** transport dispatch of the 997 (credential-dependent), multi-group/multi-TS interchanges,
  TA1 interchange-level ack for conflicts.

### 2026-08-02 — Phase 2: inbound pipeline (the receive backbone, end-to-end)

- **D68. `InboundPipeline` wires the whole receive loop into one orchestrated, safety-gated path.**
  `receive(rel, source, bytes, receivedAt)` composes the already-hardened pieces: intake gateway
  (retain + dedup) → envelope parse → translation pipeline (translate + validate) → customer connector
  (deliver) → 997 generator. Returns `{ outcome, receipt, docType?, delivered?, validation?, ack? }`
  with four outcomes and their gates:
  - **accepted** — conformant → delivered to the customer connector + 997 (AK9 `A`).
  - **rejected** — non-conformant → **NOT delivered** (a bad doc is never pushed into the customer
    system) + 997 (AK9 `R`, AK5 `R`/`5`, AK3/AK4 detail from the structured issues).
  - **duplicate** — idempotent skip (no re-delivery, no re-ack).
  - **conflict** — same interchange identity, different content → quarantined, not processed, no ack
    (auto-processing a reused-ICN/tampered replay is the exact financial-loss case).
  Refactored `IntegrationOrchestrator.deliverToCustomer` to expose `deliverDoc(rel, docType, doc)` so
  the pipeline delivers an already-translated doc only when valid, without re-translating. The 997 is
  enveloped as our outbound FA/997 to the partner (rel.envelope + shared control-number sequence);
  actual dispatch via transport is the deferred live step — the pipeline returns the ack. Wired into
  ControlPlaneModule (added X12Module/IntakeModule/AckModule imports). 4 end-to-end tests (one per
  outcome, built from a genuinely emitted+corrupted interchange).

- **D68a. Processing ledger — nothing is dropped unattended.** Prompted by user: duplicates/conflicts
  must be captured with a visible lifecycle, not silently skipped. Added `ProcessingLedger` (append-only
  audit log; `src/intake/processing-ledger.ts`) — the InboundPipeline writes exactly ONE
  `ProcessingRecord` for EVERY outcome (accepted/rejected/duplicate/conflict) with artifact id, dedup
  linkage, conformance summary, delivered flag, 997 control number, and a `needsReview` flag.
  Queries: `list(filter)`, `timeline(dedupKey)` (a document's full history under one interchange
  identity), `needingReview()` (the operator queue — conflicts + rejects). Restored `firstArtifactId`
  on DedupRecord/IntakeReceipt (alongside the normalized fingerprint) so a conflict/duplicate links to
  the ORIGINAL retained bytes; the conflicting bytes are themselves retained (content-addressed store),
  so an operator can pull BOTH versions to compare. A conflict is quarantined (`needsReview`), never
  auto-processed. 161 tests green (stable ×3), build clean. **Remaining before this loop is fully
  live:** transport dispatch of the 997 (credential-dependent), multi-group/multi-TS interchanges
  (envelope parse is single-group M1), TA1 interchange-level ack for conflicts, and a
  quarantine-resolution workflow (operator accept/reject/reprocess a reviewed event).

### 2026-08-02 — Phase 2: transport axis + connector split (csv/xlsx/database) + SFTP/webhook stubs

- **D67. Transport and format made ORTHOGONAL axes; file connector split; DB connector + transport
  stubs added.** Prompted by user: "build stub sftp/webhook as a separate connector type", "I don't
  see xlsx as a separate connector", "what about db?". **Key architecture decision:** transport (how
  bytes MOVE) and connectors (how bytes TRANSLATE to/from canonical) are separate axes that compose —
  a running integration = one transport (e.g. sftp) × one format connector (e.g. csv). This avoids a
  transport×format combinatorial explosion. Both surface in a unified catalog (ConnectorDescriptor
  `kind:'connector'` vs TransportDescriptor `kind:'transport'`) so the console lists them together.
  - **File connector split:** `FlatFileConnector` (a `type:'csv'|'xlsx'` config flag) → `FileConnector`
    base (all csv+xlsx row-codec logic) + `CsvConnector` (`csv`) + `XlsxConnector` (`xlsx`), each a
    distinct catalog type. `type` passed via base constructor param (D61 registration-order fix).
    `FlatFileParseConfig` → `FileParseConfig` (dropped the `type` field; format is now the connector).
  - **DatabaseConnector** (`database`, class `database`): translates a SQL ROWSET (array of row
    objects) ↔ canonical via ObjectMapper — real + testable. Live SQL (connect/SELECT/UPSERT) is a
    credential/driver-dependent transport concern, deferred.
  - **Transport layer** (`src/transport/`): `TransportAdapter` interface (`pull`/`push`,
    both async) + `TransportRegistry` + `TransportModule`. `SftpTransport` and `WebhookTransport` are
    **honest stubs**: real descriptors + config surface + config validation (fail loudly on missing
    host/username/vaultRef/url), but live I/O throws `TransportNotConfiguredError` (needs
    credentials/SDK). Webhook is push-based (`pull` throws) and its `receive()` is real — it shapes an
    inbound HTTP delivery into a payload and **rejects a delivery when a signature scheme is configured
    but the signature header is absent** (an unverified webhook must never be trusted as a source of
    financial docs; HMAC-vs-secret verification deferred).
  Connectors registered now: csv, xlsx, database, generic-rest, shopify, amazon, quickbooks (7).
  Transports: sftp, webhook (2). 151 tests green (stable ×4), build clean, DI smoke tests for both
  registries. **Phase 2 remaining:** live transport I/O (SFTP client, webhook HMAC + outbound POST,
  DB drivers) — all credential-dependent; and intake→validate→translate→997 auto-reply wiring (needs
  live transport to send).

### 2026-08-01 — Phase 2: 997 AK3/AK4 error detail + structured conformance issues

- **D66. Conformance validator now emits STRUCTURED issues; 997 renders AK3/AK4 detail.** The 997
  previously acknowledged only at TS granularity (D63). To report *which* segment/element failed, the
  validator had to stop emitting only strings. `ConformanceValidator.validate` now returns
  `issues: ConformanceIssue[]` (level, segmentTag, segmentPosition, elementPosition, X12 syntax
  errorCode, badValue, message) and **derives `errors: string[]` from the issues** — single source of
  truth, so all existing string-assertion tests stayed green. Error-code mappings: segment (AK304)
  2=unexpected, 3=mandatory missing, 5=exceeds max; element (AK403) 1=missing, 4=too long, 5=too
  short, 6=invalid char, 7=invalid code, 8/9=invalid date/time. Missing-mandatory-segment uses
  segmentPosition 0 (absent sentinel — we don't do ordered validation yet). `FunctionalAckService`
  gains `TransactionSetError` input and a `detailSegments` grouper that emits, between AK2 and AK5:
  element errors → one AK3 (code '8' = has data element errors) + an AK4 each (AK404 bad value only
  when present); segment errors → an AK3 with its code, no AK4. AK5 gains AK502='5' (segments in
  error) whenever detail is emitted. `TransactionSetError` mirrors `ConformanceIssue` field-for-field
  so the control plane maps 1:1 (kept ack decoupled from validation — no import). Tests: structured
  issues in conformance spec (codes + positions), AK3/AK4 rendering (element+segment, bad-value echo,
  AK502), no-error path stays bare, and an **end-to-end** validator-issues→ack-AK3/AK4 test. 138 tests
  green (stable ×3), build clean. **Phase 2 remaining:** transport adapters (SFTP/webhook —
  credential-dependent). This is the last credential-free Phase 2 item done.

### 2026-08-01 — Phase 2: xlsx support + async connector edge

- **D65. xlsx (Excel) support + Connector edge made async.** Many SMB vendors send Excel, not CSV.
  Added xlsx ingest/emit to FlatFileConnector via **exceljs** (chosen over SheetJS: SheetJS's npm
  0.18.5 carries prototype-pollution + ReDoS CVEs — patched only on their CDN; exceljs is MIT,
  maintained, and its runtime deps don't include the flagged lodash, which comes only from
  @nestjs/cli dev tooling). **Decision (user-approved):** the `Connector` interface is now **async**
  (`ingest`/`emitData` return Promises) — exceljs is async, and it's the correct model for the whole
  connector edge (real connectors do I/O: parse binary, HTTP, SFTP, OAuth) and for the transport
  layer next. Ripple was mechanical: PayloadConnector base, FlatFileConnector, IntegrationOrchestrator
  (await), and all connector specs (`rejects.toThrow` for the throw cases). `FlatFileParseConfig`
  gains `type: 'csv'|'xlsx'` + `sheet?`. xlsx is **binary**: ingest expects Buffer/Uint8Array (throws
  on a string — a UTF-8 string would corrupt binary), emit returns a Buffer.
  **`cellToString` is where xlsx correctness lives** — explicit handling of typed numbers, booleans,
  Dates (→ISO, deterministic), formula cells (uses `.result`, never the formula text), rich text,
  hyperlinks; and it **throws on an Excel error cell** (#DIV/0!, #REF!) rather than silently
  ingesting "#DIV/0!" as data (financial safety). xlsx isn't byte-deterministic (zip + timestamps),
  so it's tested by **round-trip** (emit→re-ingest recovers canonical) plus typed-cell / formula-result
  / error-cell / non-binary-payload cases. 130 tests green (stable ×4), build clean. Note: 25 npm-audit
  vulns are pre-existing dev-toolchain (nest cli/jest), not runtime/exceljs. **Phase 2 remaining:**
  transport adapters (SFTP/webhook — credential-dependent), AK3/AK4 error detail.

### 2026-08-01 — Phase 2: emit-side reverse transforms (round-trip symmetry)

- **D64. Emit-side transforms built — round-trip symmetry closed.** Ingest applied transform chains
  but emit did not, so any relationship using unit conversions couldn't convert back on the outbound
  leg. Added `ConnectorFieldMap.emitTransform?: TransformSpec[]` — an **explicit** reverse chain,
  applied in `ObjectMapper.emit` (via `formatField`, before decimal formatting — the mirror of
  ingest's transform-then-coerce). **Design decision (financial safety):** emit transforms are
  authored explicitly, NOT auto-inverted from `transform` — several ops are lossy (round/trim/upper/
  lower can't be undone) so auto-inversion would silently corrupt money/quantities. Added
  `divideByLookup` op (reverse of `multiplyByLookup`: eaches→cases ÷ packSize) with a **zero-divisor
  guard** (a 0/invalid pack size → Infinity would silently corrupt a quantity → throws instead).
  `formatField` now receives the canonical `source` record so lookup ops can resolve their key.
  Tests: `divideByLookup` (+ zero-guard) in transforms.spec; a full **round-trip** test in
  object-mapper.spec (canonical 60 eaches CA @ $18.50 → native 5 cases CS @ 1850¢ via
  divideByLookup + reverse crossref + ×100). 125 tests green (stable ×3), build clean. Reverse crossref
  uses a separate canonical→source table (directional, admin-authored) — no bijectivity assumption.
  **Phase 2 remaining:** transport adapters (SFTP/webhook — credential-dependent), xlsx, AK3/AK4
  error detail.

### 2026-08-01 — Phase 2: 997 Functional Acknowledgment generation

- **D63. 997 acknowledgment generator built (`src/ack/`).** `FunctionalAckService.buildBody(req)` is a
  pure `(AckRequest) → RawSegment[]` that emits the 997 body (AK1 · per-TS AK2/AK5 · AK9) for a
  received functional group; the control plane envelopes it (GS01='FA', ST01='997', sender/receiver
  swapped, fresh control numbers) via the existing EnvelopeService. Ack-code logic: **AK501** per TS =
  `A` (accepted) / `R` (rejected) from conformance validity; **AK901** group = `A` all accepted,
  `R` none accepted / empty-or-malformed group, `P` partially accepted. **AK9 counts**: AK902 =
  included (GE01 as *claimed* by sender, defaults to received), AK903 = received, AK904 = accepted —
  so an envelope count mismatch surfaces as AK902≠AK903. Identifiers (group control #, TS control #)
  are echoed **verbatim** (leading zeros preserved — a compliance requirement). Throws rather than
  emit an unidentifiable ack (missing functionalIdCode/groupControlNumber/TS code/control#). Wired
  into AppModule (`AckModule`). 8 tests cover the full A/R/P matrix + count mismatch + empty group +
  throw-guards + an **end-to-end** test (body → enveloped FA/997 interchange, verifies sender/receiver
  swap, GS01=FA, ST01=997, SE count, deterministic serialization). 122 tests green (stable ×3), build
  clean. **Deferred (documented):** per-segment/element error detail (AK3/AK4 + AK502–506 syntax error
  codes) — M1 acknowledges at TS granularity; and wiring intake→validate→997 as one automatic reply
  flow (needs the transport layer to actually send it back). **Phase 2 remaining:** transport adapters
  (SFTP/webhook — credential-dependent), xlsx, emit-side reverse transforms, AK3/AK4 error detail.

### 2026-08-01 — Phase 2: inbound intake lifecycle (immutable retention + idempotent dedup)

- **D62. Intake trust boundary built (`src/intake/`).** Every inbound payload — from any transport —
  now enters through `InboundGateway.receive(source, bytes, receivedAt)` BEFORE the engine sees it.
  Order of operations is deliberate for financial safety: **(1) retain raw immutably first** (a
  malformed payload is still kept — `RawArtifactStore`, content-addressed by sha256, append-only, no
  update/delete, first-write-wins), **(2) derive the interchange identity** (dedup key = X12
  sender+receiver+ICN, ISA05–08+ISA13 — robust to line-ending/whitespace differences on a genuine
  resend; falls back to `sha256:<hash>` for non-X12 payloads e.g. connector JSON), **(3) atomic
  check-and-record** (`DedupStore.register` is a single op returning post-increment state — a
  check-then-set gap would let the same interchange process twice under concurrency; DB impl uses an
  upsert/unique constraint). Returns an `IntakeReceipt` with `status: accepted|duplicate`,
  `occurrence`, `firstSeenAt`, and — critically — **`conflict`**: true when the same interchange
  identity arrives with DIFFERENT *normalized* content (reused ICN / tampered replay) → caller must
  quarantine for human review, never silently skip. **A test caught a real design flaw:** conflict
  was first computed from raw byte hashes, so a partner merely varying line endings on a legit resend
  would false-positive as a conflict (quarantine noise). Fixed by comparing a **normalized
  fingerprint** = `sha256(x12.serialize(parse(bytes)))` (whitespace collapses, business values don't).
  Stores bound to in-memory impls behind abstract classes (`IntakeModule`, wired into `AppModule`) —
  disk/S3/DB swaps in without touching the gateway; a microservice-extraction seam. 8 intake tests
  cover: accept+retain, benign byte-identical resend, whitespace-only resend (no conflict), reused-ICN
  conflict, distinct ICNs independent, non-X12 content-hash fallback, empty payload retained, atomic
  ledger count. 114 tests green (stable ×3), build clean. **Phase 2 remaining:** transport adapters
  (SFTP/webhook — credential-dependent), 997 acknowledgment generation end-to-end, xlsx, emit-side
  reverse transforms.

### 2026-08-01 — Phase 2: platform connectors (Shopify / Amazon / QuickBooks)

- **D61. Platform connector adapters built (translate-only; live transport deferred).** Added a
  `PayloadConnector` base (`adapters/payload-connector.base.ts`) for JSON-payload connectors: ingest
  validates an object payload → delegates to ObjectMapper → stamps `tenantId`; emitData delegates to
  `mapper.emit`; self-registers into ConnectorRegistry. Subclasses add only platform identity +
  a shipped default connector-map template: `ShopifyConnector`/`SHOPIFY_ORDER_TEMPLATE` (order→850),
  `AmazonConnector`/`AMAZON_ORDER_TEMPLATE` (SP-API order→850, nested `ItemPrice.Amount`),
  `QuickBooksConnector`/`QUICKBOOKS_INVOICE_TEMPLATE` (invoice→810, deep `SalesItemLineDetail.*`).
  `GenericRestConnector` refactored onto the same base. Five connectors now register via DI
  (flat-file, generic-rest, shopify, amazon, quickbooks). **⚠️ Deliberately NOT built: live
  OAuth/API fetch+push** — that's the transport layer and cannot be truthfully built/tested without
  real accounts/credentials; these adapters translate a PROVIDED payload only. **A DI smoke test
  caught a real production bug:** the base constructor called `registry.register(this)` before the
  subclass `readonly type = '...'` field initialized (JS runs subclass field initializers AFTER
  super()), so every payload connector registered under `type === undefined` and collapsed to a
  single surviving entry — in the app graph `registry.get('shopify')` would have thrown. Fixed by
  passing `type` as a base-constructor parameter property (assigned before the body). Added
  `platform-connectors.spec.ts` (payload→canonical per template) + `connectors.module.spec.ts`
  (boots real ConnectorsModule, asserts all 5 register distinctly). 106 tests green (stable ×4),
  `nest build` clean. **Phase 2 remaining:** transport/lifecycle (SFTP/webhook intake, raw
  retention, dedup, 997 end-to-end), xlsx, emit-side reverse transforms.

### 2026-08-01 — Phase 2: transform/lookup operators + reference-data (unit conversions)

- **D60. Unit-conversion capability built** — the "real work" flagged in D57. `reference-data/`
  (ReferenceDataStore: crossRef value→value + enrichment key→record; both THROW on missing = financial
  safety; own module, reusable by both edges). `connectors/transforms.ts` — fixed function library (NO
  arbitrary code): multiply/divide/round/trim/upper/lower + `crossref` (code normalization e.g. UOM
  CS→CA) + `multiplyByLookup` (cases→eaches × packSize from item master). ConnectorFieldMap gains
  `transform?: TransformSpec[]` (ordered chain, applied on ingest before decimal coercion). ObjectMapper
  injects ReferenceDataStore (optional default for tests). The flat-file unit-conversion example now works
  end-to-end (5 cases×12=60 eaches, CS→CA, 1850¢÷100=$18.50). **Property/unit test caught a real float
  bug** (round '1.005'→1.00 via Math.round) → fixed with decimal.js (→1.01). 101 tests green (stable ×6),
  build+DI OK. Note: transforms apply on INGEST; emit-side reverse transforms deferred. **Phase 2
  remaining:** transport/lifecycle (SFTP/webhook intake, raw retention, dedup, 997 end-to-end), platform
  connector (Shopify), xlsx.

- **D59. Connectors now flow end-to-end through the engine (both directions).** Added: `ObjectMapper.emit`
  (canonical→native, reverse codec — flat rows or nested object, `applyDecimal` re-formats); `Connector.emitData`
  on flat-file (canonical→CSV, minimal RFC writer) + generic-rest (canonical→JSON); `RelationshipDocument.
  connectorInstanceId` (customer-edge binding); `control-plane/connector-instance-store.ts`; `control-plane/
  integration-orchestrator.ts` — **the top of the control plane composing connector↔canonical↔engine at the
  canonical boundary**: `receiveFromCustomer` (native → validated X12 interchange) + `deliverToCustomer` (X12 →
  native). Decoupling fix: `ConnectorDescriptor` made standalone so connectors don't import control-plane (no
  cycle; control-plane→connectors one-way). Headline test: a customer **CSV → connector → canonical → engine →
  validated X12 interchange**, and back (X12 → canonical → CSV) — all driven by `TradingRelationship` config.
  93 tests green (stable ×6), build+DI OK. **Phase 2 remaining:** transform/lookup operators + reference-data
  subsystem (unit conversions), transport/lifecycle (SFTP/webhook intake, raw retention, dedup, 997 end-to-end),
  platform connector (Shopify), xlsx.

- **D58a. Admin-console spec consolidated** (`docs/design/admin-console.md` rewritten): principles
  (config-studio-not-canvas, grid-not-dragdrop, AI-drafts-human-reviews, source-liberal/canonical-strict,
  no-arbitrary-code, guided/validated, admin-first) + surfaces (palette, relationship studio topology,
  connector config w/ vault, mapping grid tiered liberty, AI onboarding, sandbox, observability, spec/IG)
  + backend provisions already in place + still-to-build + a **do-not-miss checklist**. So console
  pointers aren't lost before the launch build.
- **D58b. Phase 2 connector CORE built** (`platform/src/connectors/`): `connector.types.ts` (Connector
  interface, ConnectorInstance, ConnectorMap — declarative), `object-mapper.ts` (customer-edge codec
  native→canonical, reuses mapping/ path+coerce operators), `connector-registry.ts` (self-registration +
  `list()` catalog), `adapters/flat-file.connector.ts` (CSV via csv-parse + parse-config + BOM/quoted-field
  handling), `adapters/generic-rest.connector.ts` (JSON→canonical, nested lineOver). Connectors
  self-register at startup (verified: ['flat-file','generic-rest']). 86 tests green (stable ×6), build+DI
  OK. **Still to build (Phase 2):** emit-data (canonical→native), transform/lookup operators + reference-
  data subsystem (unit conversions), transport/lifecycle (SFTP/webhook intake, raw retention, dedup, 997
  orchestration end-to-end), pipeline integration (connectors ↔ TranslationPipeline), platform connector
  (Shopify per beachhead), xlsx.

- **D57. Edge cases + console liberty for connectors** (`connector-layer.md` §7c/§7d). Edge cases:
  cross-cutting (auth refresh, idempotency/dedup on webhook-retry+re-poll, partial-batch per-record
  errors, missed-delivery reconciliation poll, rate-limit/pagination/backoff, SCHEMA DRIFT detect+fail-
  loud, encoding/TZ, raw retention) + per-class (file: leading-zero SKUs, sci-notation, embedded
  delimiters, date ambiguity, multi-sheet, footer rows; api: pagination/signature/versioning; ecommerce:
  order edits/cancels/refunds, multi-currency, kits, SP-API SigV4+async feeds; erp: oauth/upsert/conflicts;
  db: CDC lag/migrations). Per-connector exhaustive enumeration + golden/property tests + sandbox
  validation at BUILD time; sandbox-with-real-samples is what catches them pre-prod. Console mapping
  liberty = TIERED: T0 AI-draft (all) → T1 grid point-and-click rebind/type/cross-ref (operators) → T2
  fixed transform palette (÷100, ×pack-lookup, trim…) → T3 declarative DSL (admin/advanced only). KEY
  asymmetry: SOURCE-liberal (any column/transform/lookup), CANONICAL-strict (fixed governed schema, map
  INTO it, one-offs→extensions = the moat). Always-on: live validation, required-field check, live
  preview, no-save-on-fail. No arbitrary code ever (fixed function library).

- **D56. Connector layer architecture** (`docs/design/connector-layer.md`, design only — not built).
  Connectors = customer edge = the Ingest-data/Emit-data primitives, mirroring the engine's
  Emit-EDI/Ingest-EDI on the partner edge. **Shared interface with the engine = THE CANONICAL
  DOCUMENT** — connectors expose `ingestData()→CanonicalDocument[]` and `emitData(docs)`; the
  TranslationPipeline composes connector↔canonical↔engine at the canonical boundary; neither imports
  the other (engine stays pure). Two codecs, one hub: X12 map-engine (segment/pos) on partner edge,
  connector/object-mapper (field-path) on customer edge — different DSLs, both target canonical,
  share operator lib + validation/sandbox/AI/grid machinery. Connector = thin adapter (transport+
  auth+trigger) + declarative connector-map + ConnectorInstance config (creds→vault). Types: file /
  generic-API / e-commerce (Shopify/Amazon SP-API/Walmart) / ERP (QBO/NetSuite/BC/Odoo) / database.
  v1 top-5: flat-file, generic-REST, Shopify, Amazon SP-API, QuickBooks. Console: ConnectorRegistry
  `list()`→palette; connector = customer-edge node in fixed 3-zone topology; instance-config form w/
  guided OAuth→vault; connector-map = same spreadsheet review grid (AI-draftable); per-connector
  observability. Build scope: Connector SDK/registry + object-mapper + transport/lifecycle + top-5.

- **D54. Control plane done — the composition layer that governs the pure engine.** `platform/src/
  control-plane/`: `config.types.ts` (declarative TradingRelationship + RelationshipDocument +
  format_authority + ComponentDescriptor — all JSON, no code), `map-registry.ts` (id-keyed, validates
  via MapValidator on register, `list()` catalog), `spec-registry.ts`, `relationship-store.ts`,
  `translation-pipeline.ts` (THE composition: relationship → select map+spec → engine → conformance-
  validate per authority → envelope + control numbers). Engine/validator/envelope stay pure &
  config-blind; the pipeline is the ONLY place that knows relationships. 5 tests incl. the headline
  "engine governed by config" E2E (relationship → full validated interchange), a conformance-fail
  case (bad UOM caught by pipeline), inbound round-trip, missing-config error, and catalog descriptors.
  77 tests green (stable ×6), build+DI OK.
- **D55. Admin-console provisions baked in NOW, per user (build later, ship for launch).**
  `docs/design/admin-console.md`. Console = guided config studio + AI-onboarding GRID (not n8n canvas,
  not drag-drop mapping), admin-first. Backend already console-ready: config-as-data, registries expose
  `list(): ComponentDescriptor[]` catalog, id-keyed CRUD, pipeline driven by declarative config,
  load-time validators, round-trippable relationship JSON, map JSON-schema for form-gen. Still to
  build for launch: thin API over registries/pipeline/validators/AI-onboarding + more JSON-schemas +
  the React frontend (studio, map-review grid, drop-samples onboarding, observability). No engine
  change needed — presentation layer over the declarative control plane.

- **D53. Visual workspace = config/onboarding CONSOLE, not an n8n runtime-flow canvas** (user
  refined: workspace controls ONLY control plane + connectors + AI onboarding; runtime EDI flow stays
  pure backend). Deep-research verdict (`docs/strategy/visual-workspace-feasibility.md`; synthesis
  stubbed → pulled 60+ verified claims from journal): vision is SOUND. Key evidence-based refinements:
  (1) **the map surface = a spreadsheet-style REVIEW GRID over AI-drafted maps (row per field:
  segment/element/label/target) + DSL for the hard 20% — NOT drag-drop.** That's what TrueCommerce/
  incumbents ship. (2) Pure-visual mapping insufficient; hybrid (visual+code) + engineering infra
  (Git/versioning/tests) is the norm — our config-as-data-in-Git already provides this. (3) SMBs lean
  MANAGED/turnkey; customer self-serve flow-building fights the market → workspace is ADMIN/onboarding-
  first; self-serve gated + expert-backed later. (4) AI onboarding = complement (AI drafts→human
  reviews) = our sandbox loop, AND now TABLE-STAKES (Orderful Mosaic + TrueCommerce agentic AI ship it
  in 2026) → necessary not sufficient; moat stays dropship-native + whole-portfolio + catalog. (5)
  Canonical hub validated (Orderful zero-mapping JSON, Stedi EDI→JSON). Retire: n8n free canvas,
  default customer self-serve, standalone-iPaaS positioning. Recommendation unchanged: build composable
  control-plane backend now; grid-based AI-review UI + guided config studio later (presentation layer).

- **D52. ConformanceValidator (Layer-2) done — a pure sibling of the engine.** Decision (per user):
  build validation BEFORE the control plane → keeps the "pure cores first, thin composition last"
  architecture; validation is a pure `(segments, spec)→errors` primitive like the engine. Files in
  `platform/src/validation/`: `spec.types.ts` (DocSpec/SegmentSpec/ElementSpec — requirement,
  cardinality maxUse, type AN/N/R/ID/DT/TM, min/max len, code lists; owner=client|partner),
  `specs/house850.ts` (house-format 850 — CLIENT-authored, so real reference data, no ANSI license
  needed; matches what SAMPLE_MAP emits), `conformance-validator.ts`. Checks: unknown segments,
  mandatory-segment presence + cardinality, per-element required/length/type(numeric,date)/codes.
  Validates the transaction BODY (BEG…CTT), used both directions (outbound-before-send / inbound).
  8 tests (accepts conformant 850; catches missing segment/element, bad code, non-numeric, over-length,
  unexpected segment, cardinality). 72 tests green (stable ×6), build+DI OK. Scope note: strict
  segment ORDER + loop-nesting validation deferred. NEXT: control plane (trading_relationship +
  format_authority + edi_map registry + TranslationPipeline composing engine+validator+envelope),
  which now composes two hardened pure cores.

- **D51. Config model for onboarding** (`docs/design/onboarding-and-config.md`). The old fat
  `kon_x12settings` splits into: `trading_relationship` (the spine — carries `format_authority`,
  tenant_role, version, mode, spec_id), `envelope_config` (ISA/GS identity), `connection`
  (transport + creds→vault), `edi_map` (the maps — now a per-tenant registry TABLE in the product,
  vs JSON files in the prototype), `spec`/`ig` (governing reference data, owner=client|partner),
  `relationship_document` (per-doc enablement + overrides). **Key: the boolean body-quirk flags
  (is_td5/is_ctt/inc_vadd/is_sac_decimal/po_type…) do NOT become columns — they become MAP data**
  (decimal:2, a `when`, a segment). **`format_authority` (D48) is the onboarding decision**, a field
  on trading_relationship (per-doc override possible): dictated by the deal — client onboarding own
  vendors = 'client'; client hit by a big-partner mandate = 'partner'. Onboarding order: partner →
  relationship(+authority) → envelope → connection → spec → maps (AI-drafted in Phase 3). This model
  guides the spec/IG registry build next (a spec has an owner; the relationship carries authority).

- **D50. Coercion step done.** `platform/src/mapping/engine/coerce.ts` (inverse of format.ts):
  map-driven — element `format` → ISO date, `decimal` → number; unmarked fields stay strings.
  Ingest now yields TYPED canonical (numbers, ISO dates), not strings. Symmetric with emit →
  **closes review finding #4** (formatDate re-emit crash gone; full round-trip `emit→ingest→emit`
  now reproduces original bytes with NO stripping — stronger test). Convention adopted: numeric
  elements declare `decimal` (0 for integers) — added `decimal:0` to quantity fields (output-neutral
  on emit). Property tests prove emit/ingest are true inverses on the wire (formatDate∘parseX12Date
  = id; applyDecimal∘parseDecimal = id). Property test caught a real bug: `Number('')` is 0 (silent
  money bug) → parseDecimal now rejects empty. 64 tests green (stable ×8), build OK. Note: ingest
  coercion currently THROWS on a malformed typed field (fail-loud); future = collect per-field errors.
  Spine now well-hardened (validation + coercion + all review fixes). NEXT: spec/IG registry + Layer-2
  (case-a house format), OR Phase 2 connectors + transport.

- **D49. MapValidator (Layer-1 shape) done.** `platform/src/mapping/dsl/map-validator.ts`: (a) ajv
  against `edi-map.schema.json` (runtime copy now in platform/, kept in lockstep with docs/ + map.types.ts),
  (b) structural invariants ajv can't express — position uniqueness within a segment, `match` inbound-only,
  `hl` elements only inside an hl loop. `validate()` → {valid, errors[]}; `assertValid()` throws. Provided/
  exported from MappingModule; it's the LOAD-TIME GATE the future map registry + sandbox oracle will call
  (and the safety gate the AI-map-generation loop needs). Explicitly SHAPE-only — NOT X12/IG conformance
  (that's Layer-2 / D48). 57 tests green (stable ×8), build OK. NEXT: coercion step (ingest strings→typed
  canonical), OR the spec/IG registry + Layer-2 (case-a house-format first, per D48), OR Phase 2 connectors.

- **D48. Format authority is a first-class dimension (user requirement).** Two modes the product
  MUST support, orthogonal to doc direction: **(a) CLIENT-AUTHORITATIVE** — our client defines the
  format ("house format"), their partners comply (the user's proven old model, productized); we
  validate the partner's INBOUND against our spec (partner at fault on failure) and can auto-publish
  a partner-facing IG. **(b) PARTNER-AUTHORITATIVE** — client must comply with a bigger partner's IG
  (the mandate case); we import their IG and validate our client's OUTBOUND against it BEFORE sending
  (we're at fault → avoid chargeback). The reseller-in-the-middle is BOTH (authoritative to vendors,
  compliant to big retailers). Engine/canonical/maps/sandbox UNCHANGED — this is the sandbox "both
  ends" (D30) at the format level. New artifacts: a **spec/IG registry** where a spec is tagged
  client-owned vs partner-owned, + a `formatAuthority` flag per trading relationship; validation
  targets the accountable side. **Resolves the ANSI-sourcing concern (D-review):** case (a) = we
  define the spec (no external standard needed); case (b) = the partner hands us their IG; raw ANSI
  standard becomes optional sanity-reference, not a blocker. Build order: case (a) is easier for
  Layer-2 conformance validation (we own the spec) + is the proven model → do it first; case (b)
  needs a real partner IG. Validation layers (from prior turn): L1 map-shape (ajv, cheap, now) · L2
  spec/IG conformance (this) · L3 partner-IG specifics (subsumed into the registry).

### 2026-07-31 — Clean personal git repo set up + pushed

- **D47. Committed to a fresh personal repo.** New remote `https://github.com/PankajMore024/edi-platform`
  (separate repo, NOT EDI_ANSI_X12). Fresh history (old company `.git` backed up outside repo, recoverable),
  repo-LOCAL personal identity (PankajMore024 / more.pankaj024@gmail.com) — global company identity in
  `~/.gitconfig` untouched. **Clean scope:** committed only `platform/` + `docs/` + `.claude/` + `.github/ci.yml`
  + README/.gitignore (85 files); old koneect app left on disk untracked (harvest reference). Security-verified
  no `.env`/secrets/`storage`/partner-data/`node_modules` staged. Pushed `main` via one-time fine-grained PAT
  (not persisted in config).
- **EDI_ANSI_X12 finding:** the user's earlier personal repo (github.com/PankajMore024/EDI_ANSI_X12) is the SAME
  koneect base + a squashed "multi-tenant SaaS" commit — Express/JS with tenancy models, REST API v1, Bull/Redis
  queues, S3 storage, webhooks, API-key auth, rate limiting — but its CORE is STILL the hardcoded parsers (no
  canonical/map engine). = SaaS PLUMBING on the old core. Complements our platform (clean core, no plumbing yet).
  → harvest source for Phase 2–5 plumbing; do NOT adopt its core. ⚠️ It had `.env` committed and was briefly made
  PUBLIC for this analysis → user must re-private + rotate those creds.

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
