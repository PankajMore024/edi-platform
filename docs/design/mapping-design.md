# Vendor-Wise Mapping — Design

> Status: **DESIGN ONLY** (no engine refactor; see `context.md` IP gate).
> Scope anchor: one full **850 round-trip** (850 out → 855/997 in).

## 1. Problem & principle

The X12 envelope is already partner-agnostic config. The **transaction body**
is hardcoded per doc type, and per-partner variation has accreted as boolean
columns (`is_td5`, `inc_td5`, `is_ctt`, `inc_vadd`, `is_sac_decimal`, …) plus
if/else branches in each `utils/parser/edi*Parser.js`.

**Principle:** a partner is a *document map* (data), not a code path. The engine
is generic; everything partner-specific lives in JSON maps.

## 2. The leak to fix first: canonical document

Today callers pass X12-shaped JSON (`beg01`, `po105`). That means mapping logic
is split between the parsers and the upstream caller. The fix is a **canonical
business document** — clean, X12-agnostic — as the engine's only input/output.
The map translates `canonical ↔ X12`. This is the single most important design
decision; without it "clean JSON in" stays a fiction. **Resolved (O1 → D7–D9):**
canonical front door, with (a) common business facts as first-class fields,
(b) qualifier-coded segments as typed `{type,value}` arrays, (c) an `extensions`
escape hatch, and (d) **separate inbound/outbound document shapes sharing
sub-components via `$ref`**. See `docs/schema/canonical/`.

Canonical PO (illustrative):

```jsonc
{
  "po": {
    "poNumber": "PO-10001",
    "type": "SA",
    "purpose": "00",
    "date": "2026-06-07",
    "references": [ { "qualifier": "DP", "value": "DEPT-42" } ],
    "contact": { "name": "Buyer", "phone": "5551234567" },
    "shipTo": { "name": "Store 12", "address1": "1 Main St", "city": "Austin", "state": "TX", "zip": "78701", "country": "US" },
    "billTo": { "name": "HQ", "address1": "9 Central Ave", "city": "Austin", "state": "TX", "zip": "78702" },
    "routing": { "method": "M", "carrier": "UPSN" },
    "lines": [
      { "line": 1, "qty": 10, "uom": "EA", "price": 9.99, "buyerPart": "B-1", "vendorPart": "V-1", "upc": "0001", "description": "Widget" }
    ]
  }
}
```

## 3. Three layers

| Layer | What | Where | Status |
|---|---|---|---|
| A. Envelope | ISA/GS/ST: qualifiers, control numbers, delimiters, mode, FTP | `kon_x12settings` + `ediTemplateParser.js` | **Exists — keep** |
| B. Document map | per (partner, docType, direction) segment/element/loop rules | JSON files in `maps/` (see D5) | **To design/build** |
| C. Engine | one generic interpreter of maps → `node-x12` | new `utils/mapEngine/` | **To design/build** |

## 4. Document map schema (layer B)

A map is ordered `structure`. Each node is a **segment** or a **loop**.

### Segment node
```jsonc
{
  "segment": "BEG",
  "when": "<condition>",          // optional: include only if truthy
  "over": "<arrayPath>",          // optional: repeat per array item ($item in scope)
  "match": { "pos": 1, "eq": "ST" }, // inbound only: identify this segment/loop
  "elements": [
    { "pos": 3, "path": "po.poNumber" },           // bind element 03 to canonical path
    { "pos": 2, "const": "00" },                   // literal
    { "pos": 5, "path": "po.date", "format": "CCYYMMDD" },
    { "pos": 4, "path": "$item.price", "decimal": 2 },
    { "pos": 1, "count": "po.lines" },             // derived: array length
    { "pos": 7, "path": "$item.buyerPart", "qualifier": { "pos": 6, "const": "BP" } },
    { "pos": 8, "default": "EA" }                  // fallback when source empty
  ]
}
```

### Loop node
```jsonc
{ "loop": "lines", "over": "po.lines", "when": "po.lines", "segments": [ /* segment nodes */ ] }
```

### Element binding operators (the whole DSL — keep it this small)
| Key | Meaning |
|---|---|
| `path` | dot-path into canonical doc; `$item` = current loop item |
| `const` | literal value |
| `default` | value when `path` resolves empty |
| `format` | date/number format (e.g. `CCYYMMDD`, `HHMM`) |
| `decimal` | decimal places (folds `is_sac_decimal`) |
| `count` | length of an array path (e.g. CTT01) |
| `qualifier` | companion element that qualifies this one |
| `when` (node) | inclusion predicate (folds `is_ctt`, `inc_vadd`, presence of `routing`) |
| `over` (node) | repetition source |
| `match` (node) | inbound identification key |

That is the complete operator set for the prototype. Add more only when a real
partner forces it (D6).

## 5. How boolean flags collapse into the map

| Today (column + branch) | In the map |
|---|---|
| `is_td5` / `inc_td5` (3 duplicated PO1 loops) | TD5 is a segment placed where the partner wants it (header loop or per-line). Placement = position in `structure`. |
| `is_ctt` | `"when": "config.includeCtt"` or simply present/absent |
| `inc_vadd` | `billTo` loop present/absent (`"when": "po.billTo"`) |
| `is_sac_decimal` | `"decimal": 2` on the element |
| `po_type` | `const`/`default` on BEG02 |
| prod vs test (`edi850TestProcessor`) | `mode` stays envelope config — not a code path |

**Onboarding partner N = author one JSON map. Zero parser code.**

## 6. Engine (layer C)

```
buildDocument(canonicalDoc, partnerMap, envelopeConfig):
  segments = []
  for node in partnerMap.structure:
     if node.when and not eval(node.when, doc, config): continue
     items = node.over ? resolve(node.over) : [null]
     for item in items:
        if node is loop: recurse over node.segments with $item = item
        else:
           els = []
           for e in node.elements: els[e.pos] = resolveElement(e, doc, item, config)
           segments.push({ tag: node.segment, elements: densify(els) })
  return generateEnvelope(envelopeConfig) + node-x12(segments)
```

- `node-x12` and the existing envelope template are **unchanged** — the engine
  emits the same `{ tag, elements }` shape the parsers build today.
- One engine serves all doc types and directions.

## 7. Inbound (855 / 997) — closing the round-trip

Inbound is the inverse traversal: X12 element position → canonical path. Two
concepts outbound doesn't need:

1. **`match` keys** — e.g. which `N1` loop is ShipTo vs BillTo is decided by
   `N101` qualifier. The map declares `"match": { "pos": 1, "eq": "ST" }`.
2. **997 reconciliation** — the 997 map is special: `AK1/AK2/AK5/AK9` bind to
   *control numbers* to acknowledge what was sent (reconcile against
   `kon_x12datas`), not to a business document.

For the prototype: **separate `*.outbound.json` / `*.inbound.json` maps per
docType.** A single bidirectional map is elegant but over-engineering now (D6).

## 8. Validation

- A JSON-Schema (`docs/schema/edi-map.schema.json`) validates the maps
  themselves at load time.
- A per-partner required-element check (cheap) catches missing mandatory
  segments before transmission.
- This is the infra ceiling for the prototype — no schema registry, no UI.

## 9. Migration path (when IP gate clears)

1. Build the engine + schema; port the **850 outbound** map for the *current*
   partner — assert byte-identical output vs. the existing parser (golden file
   from `storage/edi/850/`).
2. Author a 2nd partner's 850 map; onboard with zero code change (the proof).
3. Add inbound **855** then **997** maps; close the round-trip.
4. Fan out to 810 / 846 / 856.
5. Retire boolean columns + per-doc parser bodies as each is covered.

## Open questions

See `context.md` → O1 (canonical vs current X12-shaped JSON) is the blocking
fork for finalizing the schema.
