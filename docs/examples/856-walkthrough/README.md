# 856 (ASN) — three-layer walkthrough

> A concrete, self-contained worked example of the architecture in
> `docs/mapping-design.md`, applied to the **hardest** transaction set we support.
> Partner-agnostic / illustrative — not derived from any real partner spec.
> Status: **DESIGN ONLY** (IP gate O2 still open — see `docs/context.md`).

## Why 856 is the right thing to pressure-test

850 is mostly flat. 856 is a **hierarchy** — Shipment → Order → Pack → Item —
with HL segments that carry auto-numbered ids, parent pointers, and a child flag.
If the three-layer design survives 856, it survives everything else we ship
(810/846/855/997 are all simpler). If it cracks, it cracks here. So this example
is the real test of "are we correct so far."

## The three layers, mapped to files

| Layer | File | Role | Build status |
|---|---|---|---|
| **A — Envelope** | `envelope.config.json` | ISA/GS/ST framing, delimiters, control #s, transport | **Exists in prod** (`kon_x12settings`) — keep |
| **B — Document map** | `856.outbound.map.json` | per-(partner, 856, outbound) declarative rules | the new artifact |
| **C — Engine** | `engine-notes.md` | one generic interpreter `map → node-x12` | to build |
| (input) | `canonical/856.outbound.example.json` | clean business doc the customer's app emits | — |
| (output) | `expected/856.output.edi` | byte target the engine must produce | golden file |

## The data flow

```
customer app
   │  produces
   ▼
canonical/856.outbound.example.json      ← clean, X12-agnostic. NO HL numbers,
   │                                        NO segment tags, NO qualifiers.
   │  engine reads canonical + map + envelope
   ▼
[ Layer C engine ]  ──uses──►  856.outbound.map.json (B)  +  envelope.config.json (A)
   │  emits {tag, elements}[] → node-x12 → envelope
   ▼
expected/856.output.edi                  ← the X12 ASN on the wire
```

Read it in that order: canonical in → map → expected out. The map is the only
file that changes when you onboard a new partner.

## What the map proves (the wins)

Every per-partner 856 variation that today would be a boolean column + an if/else
branch in `edi856Parser.js` becomes **data** in `856.outbound.map.json`:

- ship-from present or not → a `loop` with `when`, not a flag
- carrier id qualifier (SCAC vs other) → a `const` element
- which references ride in the shipment HL → a `const` qualifier + `over`
- carton weight / packaging codes → element bindings with `decimal`
- PID description on/off → `when: "$item.description"`

**Onboard partner N for 856 = author one JSON map. Zero parser code.** That claim
holds for the 80% — and that is the good news.

## Where the design HAD to bend — and the verdict

This is the part worth your attention. Honest principal-architect read:

### 1. The frozen DSL could not express HL. We added exactly one node type.

The 850 DSL (D6) has `segment` and `loop` nodes. Neither can produce:

- **HL01** — a counter unique across the *whole* transaction (1..6 here)
- **HL02** — a pointer to the *parent's* HL01 (pack 2 → `HL02=2`, the order)
- **HL04** — `1`/`0` depending on whether children were emitted

These are structural facts the engine must own; a map author cannot hand-write
them without re-introducing the hardcoding we are trying to delete. So the map
introduces an **`hl` node with a `children` array** (see `856.outbound.map.json`),
and the engine grows an HL-aware recursive walk (see `engine-notes.md`). This is
the **first justified extension since we froze the DSL** — and it is justified
exactly the way D6 says extensions should be: a real document forced it.

> **Verdict on the core take: confirmed, with a refinement.** "Partner = data,
> engine = generic" still holds. But the engine is not docType-blind — it needs a
> small amount of *structural* intelligence (HL numbering) that is the same for
> every partner's 856. That is fine: it lives in the engine (shared), not in the
> map (per-partner). The line we care about — *partner variation is data* — is
> intact.

### 2. Two values are emit-time facts, not canonical paths.

`CTT01` = count of HL segments (`$hlSegments`) and `SE01` = total segment count.
850 only ever needed `count` over a canonical array. 856 introduces **engine-derived
tokens**. Small, but note it: the DSL's value sources are now {path, const,
default, count-of-array, **count-of-emitted**}.

### 3. SSCC and rollups are enrichment, NOT map operators — hold this line.

The MAN barcode (`$item.sscc`) is read straight from canonical here. The moment a
partner asks the platform to *generate* SSCC-18s, or to *sum* carton weights from
items, the temptation is a "compute" operator in the map. **Don't.** That becomes
embedded logic in maps — the top-5 EDI-SaaS regret from
`saas-architecture-analysis.md §5`. It belongs in a pre-engine enrichment step.
856 is where that pressure first appears, which is exactly why testing on 856 is
valuable.

### 4. Blind spot this surfaces for the SaaS version.

Inbound 856 (receiving an ASN) needs the inverse: **reconstruct the hierarchy from
HL02 parent pointers** into nested canonical `orders[].packs[].items[]`. That is a
genuinely different engine path (build a tree from a flat list) and the `match`
concept (mapping-design.md §7) is not enough on its own. We have only designed
*outbound* 856 here. Flag inbound 856 as its own design task before we claim 856 is
"done".

## How you'd verify this once the engine exists (migration step 4)

1. Feed `canonical/856.outbound.example.json` + `856.outbound.map.json` +
   `envelope.config.json` to the engine.
2. Assert output is **byte-identical** to `expected/856.output.edi` (golden file).
3. Author a *second* partner's `856.outbound.map.json` (different qualifiers,
   ship-from omitted, references reordered) and confirm it onboards with **zero**
   engine change. That is the proof the architecture is right.

## TL;DR for the decision log

- The three-layer split **holds for 856**. ✅
- Cost of admission: **one new `hl` node type** + an HL-aware recursive walk in the
  engine + the `$hlSegments` token. All shared, none per-partner.
- Two lines to defend going forward: (a) **no compute/enrichment operators in
  maps**; (b) **inbound 856 is a separate, harder design** (flat→tree).
