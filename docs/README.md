# EDI Productization — design docs

Design and decision record for turning the working X12 EDI engine into a
**multi-tenant, vendor-mapped EDI SaaS** (EDI-as-API + managed EDI) for dropship
and retail supply chains.

> **Status: DESIGN ONLY.** No engine refactor until the IP gate (O2 in
> [context.md](context.md)) is cleared. Provider-agnostic by default.

## Start here (reading order)

1. **[context.md](context.md)** — the decision log + open questions. The spine; read first.
2. **[design/mapping-design.md](design/mapping-design.md)** — the core idea: three layers
   (envelope config / per-partner declarative map / one generic engine).
3. **[examples/856-walkthrough/README.md](examples/856-walkthrough/README.md)** — see the
   three layers applied end-to-end to the hardest doc type (856 ASN). Best way to
   *get* it.
4. **[schema/canonical/README.md](schema/canonical/README.md)** — the business contract:
   one direction-neutral canonical doc per type, and the input/output convention.
5. **[design/engine-structure.md](design/engine-structure.md)** — target build (NestJS
   modules + fault-tolerant type coercion).
6. **[design/saas-architecture-analysis.md](design/saas-architecture-analysis.md)** — the
   multi-tenant / multi-version SaaS analysis (transaction sets, versions, moat).

## Directory map

```
docs/
├── README.md          ← you are here (index)
├── context.md         ← decision log (D1…) + open questions (O*, S*)
├── design/            ← design & analysis
│   ├── mapping-design.md
│   ├── engine-structure.md
│   └── saas-architecture-analysis.md
├── schema/            ← the contracts
│   ├── edi-map.schema.json          (validates partner maps)
│   └── canonical/                   (business docs — direction-neutral)
│       ├── README.md                (input/output convention)
│       ├── common.schema.json       (shared sub-objects + inboundMeta)
│       ├── 850.schema.json + .example.json   (Purchase Order)
│       ├── 855.schema.json                   (PO Acknowledgment)
│       ├── 856.schema.json + .example.json   (Advance Ship Notice)
│       └── 997.schema.json                   (Functional Ack)
└── examples/          ← worked examples
    ├── 850.map.example.json         (a partner's 850 map)
    └── 856-walkthrough/             (full 3-layer 856 example)
```

## The model in one paragraph

A trading **partner is data (a map), never code.** The client sends/receives
**business facts** in a canonical document (one shape per doc type, the same
whether sent or received — direction is a property of the *relationship*). The
product owns everything X12: per-partner **maps** add the quirks, **config**
supplies master data, **enrichment** computes derived values, and **one generic
engine** translates canonical ↔ X12. This replaces the per-vendor `if/else` ladder
(see the coreapp analysis in [context.md](context.md)).

## Not in version control (gitignored)

- `_private/` — scratch for redacted real artifacts.
- `EDI_DOCS/` — real production samples shared as reference (schemas, coreapp
  caller, data dumps). Contains real partner data — never commit. These are the
  evidence behind D15+ in [context.md](context.md).
