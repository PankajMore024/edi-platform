# EDI SaaS Platform — Principal Architect Analysis

> Strategic analysis for a multi-tenant, dropship/retail-focused EDI SaaS
> ("EDI as API" + "EDI as a Service"). Companion to `context.md` /
> `mapping-design.md`. Reference peers: SPS Commerce, TrueCommerce, Orderful,
> Stedi, CommerceHub, Radley.
>
> Reality check up front: the current repo is a **single-version (4010),
> SFTP, buyer-side prototype**. The target state below is effectively a
> ground-up platform; the existing engine is a reference for domain logic, not
> the foundation for thousands of partners. (And the IP gate, O2, still stands.)

## 1. Transaction Set Coverage

Current: 850, 855, 856, 810, 846, 997. That's a solid order-to-cash core.

| Tier | Sets | Why |
|---|---|---|
| **MVP must-have** | 850, 855, 856, 810, 846, 997 | Dropship order-to-cash loop. (Have these.) |
| **Commonly requested** | **860/865** (PO change + ack), **820** (remittance), **852** (POS/product activity), **832** (price/sales catalog), **816** (org/location hierarchy), **824** (application advice), **753/754** (routing request/instructions), **214** (shipment status/tracking) | Retailers expect PO changes, remittance, catalog, routing compliance, app-level acks. |
| **Enterprise-grade** | **812** (credit/debit — chargebacks/deductions), **940/943/944/945/947** (3PL/warehouse), **830/862** (forecast/planning & shipping schedules), **204/210/211/990/214** (transportation/freight), **870** (order status), **180** (RMA) | Larger programs, 3PL fulfillment, VMI/replenishment, managed transportation. |
| **Rare but important** | **864** (text), **875/876/888** (grocery PO/maint), **101** (addr lists), **TA1** (interchange ack), EDIFACT **ORDERS/DESADV/INVOIC** (international), **248/868** | Niche but deal-makers for specific partners/verticals. |

**Blind spot (challenge):** in *dropship/marketplace* specifically, a large and
growing share of "EDI" is **not X12 at all** — Amazon (SP-API), Walmart DSV,
Wayfair, Target+, Shopify, cXML (Ariba/Coupa), and flat-file/JSON portals.
TA1/997/824 acks and X12 are table stakes for traditional retail, but if your
wedge is dropship/marketplace, **non-X12 connectors may matter as much as new
X12 sets.** Treat "transaction set" as one shape of a more general "document
type," and connectors as first-class (see §7/§8).

## 2. Version Strategy

| Version | Retail/dropship reality | Support? |
|---|---|---|
| **4010** | **Dominant** in retail & dropship. Massive installed base; most retailer IGs are 4010. | **Yes — primary.** |
| **5010** | Mandated in healthcare; present but secondary in retail (some larger/newer programs). | Yes — secondary. |
| **4030/4040/4050/4060** | Exist; specific retailers standardized on one (e.g. some on 4050/4060). Niche. | Opportunistic, per partner. |
| **6010+** | Rare in retail. | Defer. |
| **VICS / GS1 US retail conventions** | Not a "version" — a retail profile historically layered on X12. Many retail IGs follow VICS conventions. | Know it; model as an IG layer. |

**Most common today:** 4010 first, 5010 second; everything else long-tail.

**The real point:** *version is necessary but not sufficient — the **partner
Implementation Guide** is the unit of truth.* Two partners on "4010 850" can
differ wildly. Don't over-invest in version breadth; invest in IG modeling (§3).

**Canonical: version-agnostic; translation: version-aware.** The canonical model
expresses **business meaning** and must not encode X12 structure or version. The
**mapping/translation + validation layers are version-aware** (they know segment
positions, code lists, cardinality per version). Caveat: a few genuinely-new
semantics across versions become *optional, additive* canonical fields — never
version branches in the canonical.

## 3. Implementation Guide Strategy — metadata-driven cascade

Model the effective spec as a **layered inheritance cascade** (think CSS
specificity), each layer pure metadata, each versioned:

```
Effective IG = X12 base (version)
             ⊕ Industry/convention profile (VICS, grocery)   [optional]
             ⊕ Partner Implementation Guide (the retailer's IG)
             ⊕ Trading-relationship overrides (tenant ↔ partner: envelopes,
                control #s, delimiters, test/prod, connectivity)
             ⊕ Tenant/customer overrides
```

Later layers override earlier via **sparse overrides** (only state differences).

- **X12 base** = reference data: segments, elements, data types, code lists,
  loops, cardinality per version. Drives validation + structural awareness.
- **Partner IG** = which segments/qualifiers/code-subsets/cardinality the partner
  actually uses. This is your crown-jewel asset (see §6 shared templates).
- **Relationship layer** = the pairing specifics (envelope IDs, control-number
  series, connection).
- **Tenant layer** = customer-specific tweaks.

Maps reference an **effective IG by id + version**. Separate concerns hard:
*"what the standard/IG allows"* (validation) vs *"what this partner does"*
(mapping). Conflating them is a classic mess.

## 4. Canonical Model — is 80/20 enough?

The 80/20 framing is a fine *starting heuristic* but will mislead at scale.
Weaknesses that emerge at hundreds–thousands of partners:

1. **The 20% is not uniform — it clusters.** Header/simple docs are ~stable;
   **856 (ASN hierarchy)** and **financial docs (810 allowances/charges SAC,
   812 chargebacks, 820 remittance)** carry disproportionate variation. Your
   80% holds for 850 headers and breaks exactly where the money/disputes are.
2. **Canonical drift / God-object.** Pressure to add fields per partner bloats
   the model. Needs governance + the discipline already chosen (typed `{type,
   value}` arrays + `extensions`, graduate-when-recurring).
3. **Code-value normalization is a first-class problem, not a mapping detail.**
   Same concept, different codes (UOM, ship method, SCAC, dates). You need a
   centralized **code cross-reference** subsystem, not per-map conversions.
4. **Hierarchy fidelity.** 856 HL (shipment→order→pack→item) and nested
   packaging need a **recursive/hierarchical canonical**, not a flat one. One
   canonical shape per doc isn't always enough.
5. **Round-trip lossiness.** Parse→canonical→regenerate can drop data. For
   "EDI as a Service" / audits / chargeback disputes you **must keep the raw
   original** alongside canonical, byte-for-byte. (Inbound `unmapped` capture is
   necessary but not sufficient — keep the raw artifact too.)
6. **Identity & relationships.** Retail lives on identifiers: GLN/DUNS, GTIN/UPC,
   buyer/vendor part numbers, **store/DC hierarchies**. This is a core
   subsystem (cross-reference + master data), not a canonical field.
7. **Canonical versioning.** The canonical itself will evolve; you need schema
   versioning + tenant pinning + migration, or you break customers.

**Recommendation:** per-doc canonical with hierarchical support; a dedicated
**reference-data/cross-reference service**; canonical versioning + tenant
pinning; always retain raw; a governance process for canonical changes.

## 5. Mapping Engine — abstractions beyond field mapping

A field-to-field mapper is ~20% of what you need. Required abstractions:

- **Conditional inclusion** — `when` predicates (segments/loops/elements).
- **Loops & hierarchy** — repeating + **nested** loops (HL trees), with context
  (`$item`, parent refs).
- **Qualifier substitution** — choose/derive qualifiers per partner.
- **Code conversion / cross-reference** — table-driven partner-code ↔ canonical
  value, reusable across maps (NOT inline per map).
- **Derived/computed fields** — totals/counts/hash totals (CTT/TDS/SE/GE),
  control numbers, decimal scaling, date reformatting.
- **Defaults & fallbacks** — element/segment level.
- **Enrichment lookups** — pull from item master / address book / GLN registry
  during translation, **declaratively** (named lookups), never ad-hoc.
- **Validation rules** — (a) **syntactic** vs IG (cardinality, code lists, data
  types) → drives 997/TA1; (b) **business/compliance** (qty>0, partner-required
  REF, ASN-must-match-PO) → drives 824/scorecards. Keep these separate.
- **Transforms** — pad/truncate/format/split/merge/round.
- **Direction-awareness** + **error policy** (reject / warn / dead-letter /
  partial-accept).

**Hard architectural call (challenge):** *do not allow arbitrary code (embedded
JS) in maps.* In multi-tenant it's a security + tech-debt disaster. Use a
**declarative DSL + a fixed, versioned function library**, with a
**sandboxed/governed** custom-transform escape hatch only when unavoidable.
"Custom transformation = arbitrary code" is one of the most common EDI-SaaS
regrets. Maps must be **deterministic and golden-file testable.**

## 6. Multi-Tenant SaaS Considerations

- **Tenant isolation.** Row-level `tenant_id` minimum; consider schema/DB
  isolation for large/regulated tenants. **Per-tenant secrets** (partner SFTP/AS2
  creds, keys) in a secrets manager, encrypted, never in config tables. Guard
  noisy-neighbor (per-tenant throughput limits, isolated workers for big tenants).
- **Shared IGs / partner templates = the moat.** A central, curated library of
  partner IGs + maps ("Walmart 850 v4010") reused across tenants is exactly what
  makes SPS/TrueCommerce defensible. Tenants **subscribe** to a partner template,
  then **override**. Build the catalog + subscription/override model early.
- **Reusable mapping templates / inheritance.** Template → tenant clone with
  sparse overrides; versioned templates; **opt-in** propagation of template
  updates to subscribers (never auto-break a live partner).
- **Partner onboarding at scale = your real scaling constraint** (not
  throughput). Invest in: IG ingestion (partner 200-page PDF specs are the
  bottleneck), a **test/certification harness** (partners require test cycles),
  automated validation against the IG, sample-data generation, connectivity
  setup, and **certification tracking**.
- **Backward compatibility.** Immutable **published** map/IG/canonical versions;
  pin per relationship; staged rollout; **per-partner golden-file regression**
  suite. Never mutate a live map in place.

## 7. Future-Proofing — "Stripe for EDI"

**Decide now:**
- **API-first; EDI is an implementation detail.** Clean resource model (Order,
  Shipment, Invoice, InventoryFeed), **webhooks**, **idempotency keys**, sandbox,
  test partners, excellent DX/docs. Your canonical model *is* your public API.
- **Pluggable transport.** AS2 / SFTP / VAN / HTTPS-API / marketplace connectors
  behind one abstraction. Many "partners" are APIs now — don't bake
  X12-over-SFTP into the core.
- **Event-driven, fully observable core.** Every document is an event with a
  status lifecycle, full audit trail, search, and **replay/reprocess**.
  Visibility is a *product*, not plumbing (SPS/CommerceHub sell dashboards).
- **Config-as-data everywhere** — onboarding never requires a code deploy.
- **First-class control-number / dedup / idempotency services.**
- **Separate translation ⟂ connectivity ⟂ orchestration.**

**Avoid:**
- Assuming X12-only / single-version / SFTP-only.
- Arbitrary code in maps.
- A lossy or God-object canonical; not retaining raw.
- Any hardcoded partner logic (the founding premise).
- Conflating syntactic vs business validation.
- Synchronous tight coupling to enrichment/master-data sources.
- GraphQL-first for ingestion — REST + webhooks fits EDI flows better (Orderful/
  Stedi pattern); offer GraphQL for reads if customers ask, don't lead with it.

**What becomes tech debt in EDI SaaS (learned the hard way):**
- The 20% creeping back into **code** as per-partner special cases.
- Maps as untested, unversioned **snowflakes** → silent regressions.
- Bolted-on **control-number** management → races/duplicates at scale.
- **Onboarding/certification** done manually → growth ceiling.
- **Lossy canonical** → can't reproduce originals for **chargeback disputes**
  (legal/financial exposure).
- **Code cross-reference** scattered across maps instead of centralized.
- Weak **observability** → support-ticket avalanche.
- Translation coupled to transport.
- **Date/timezone & decimal/rounding** bugs in financial docs.
- Encoding/delimiter/segment-terminator edge cases.
- Not preserving **exact received bytes** (audit/legal).

## 8. Proposed Target State

Layered, event-driven, metadata-driven. Each layer independently scalable.

```
┌─ Connectivity / Edge ──────────────────────────────────────────────┐
│ Protocol adapters: AS2 · SFTP · VAN · HTTPS/API · marketplace conns │
│ Ingest → store IMMUTABLE RAW artifact → emit "interchange received" │
└─────────────────────────────────────────────────────────────────────┘
┌─ Interchange / Envelope service ───────────────────────────────────┐
│ ISA/GS/ST parse+build · control-number mgmt · dedup · ack orchestr. │
│ (997 / TA1 / 824)                                                   │
└─────────────────────────────────────────────────────────────────────┘
┌─ Translation / Mapping engine (stateless, deterministic) ──────────┐
│ X12 ⇄ Canonical · version-aware · effective-IG + tenant map ·       │
│ declarative DSL + function library · code cross-reference            │
└─────────────────────────────────────────────────────────────────────┘
┌─ Canonical Document Model + Resource API ──────────────────────────┐
│ per-doc (hierarchical) · versioned · REST + webhooks · idempotency  │
└─────────────────────────────────────────────────────────────────────┘
        supported by ↓ shared services
┌─ IG/Spec & Mapping Registry ─┐ ┌─ Reference Data ────────────────┐
│ base→industry→partner→rel→   │ │ code sets · cross-refs (UOM/SCAC)│
│ tenant cascade · versioned · │ │ identities (GLN/DUNS/GTIN) ·     │
│ shared template catalog      │ │ store/DC hierarchy · master data │
└──────────────────────────────┘ └──────────────────────────────────┘
┌─ Validation ─────────────────┐ ┌─ Workflow / Orchestration ──────┐
│ syntactic (IG) + business +  │ │ doc lifecycle state machine ·   │
│ compliance → 997/824/scorecard│ │ retries · dead-letter · SLAs ·  │
└──────────────────────────────┘ │ partner certification flows      │
┌─ Observability ──────────────┐ └──────────────────────────────────┘
│ dashboards · alerts · search ·│ ┌─ Tenant & Identity ─────────────┐
│ audit trail · replay/reprocess│ │ multi-tenant config · RBAC ·    │
└──────────────────────────────┘ │ secrets · isolation              │
┌─ Onboarding & Test harness ──┐ └──────────────────────────────────┘
│ self-service · IG import · test data · cert tracking · golden tests │
└─────────────────────────────────────────────────────────────────────┘
```

**Storage:** immutable raw artifacts (object store) · canonical docs (DB/event
store) · config/metadata (versioned) · append-only audit log. **Backbone:**
durable event stream (Kafka/queue) so everything is replayable.

## Assumptions Challenged / Blind Spots (the hard-won lessons)

1. **80/20 underestimates the hard part.** The variation clusters in 856 +
   financial/chargeback docs — exactly where errors cost real money.
2. **In dropship/marketplace, "EDI" is increasingly APIs.** Amazon DSV, Walmart,
   Wayfair, Target+, Shopify, cXML. A pure-X12 platform may miss your own niche;
   connectors are strategic, not a footnote.
3. **The money is in compliance & visibility, not translation.** Dropship vendors
   bleed on **chargebacks** (ASN accuracy, GS1-128 labels, routing/EDI compliance,
   late acks). A **compliance scorecard + monitoring** product may outsell the
   translator. Translation is table stakes; this is differentiation.
4. **Onboarding/certification is the scaling wall**, not runtime throughput.
   Whoever automates IG ingestion + partner certification wins.
5. **The IG — not the X12 version — is the unit of value.** Optimize for IGs.
6. **VANs still exist.** Some partners only connect via VAN; don't assume direct.
7. **Control-number management + idempotency** is deceptively hard at scale and a
   top source of production incidents.
8. **Retain raw bytes forever** (audit/dispute/legal). Non-negotiable in retail.
9. **Test/cert environments per partner** are mandatory, not nice-to-have.
10. **Your current codebase is a prototype, not the platform.** The jump to
    multi-tenant/multi-version/multi-protocol is a rebuild; harvest the domain
    logic, don't extend the architecture. (And IP gate O2 still gates all of it.)

## Open strategic questions

- **S1.** Is the wedge traditional X12 retail, or dropship/marketplace (which is
  API-heavy)? Determines whether connectors or X12 breadth come first.
- **S2.** "EDI as API" vs "EDI as a Service" — which is the *primary* GTM for the
  first 3–4 clients? They imply different first investments.
- **S3.** Build the shared partner-template catalog early (moat) vs. bespoke maps
  per early client (faster to first revenue)?
- **S4.** Compliance/scorecard as a product line — in or out of MVP?
