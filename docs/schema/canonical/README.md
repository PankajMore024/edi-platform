# Canonical schemas — the product's business contract

Business-pure documents the product exchanges with **clients** (not with trading
partners — that's X12). **One canonical shape per doc type, direction-NEUTRAL**,
partner-agnostic, shared by every client and every partner.

> The load-bearing rule (context.md): a partner is a **map**, never a schema edit.
> The client sends/receives **business facts**; the product owns all X12 mapping,
> master-data lookup, and enrichment.

## Direction is a property of the RELATIONSHIP, not the doc type

A Purchase Order is the same business object whether you send it or receive it.
**Direction lives in the `(client, partner, docType)` relationship**, and it only
decides two things: which way the engine runs (build vs parse) and which map.
The business document shape does **not** change.

The same doc type flows opposite ways for opposite roles:

| Client role | 850 PO | 855 ack | 856 ASN | 810 invoice | 997 FA |
|---|---|---|---|---|---|
| **Buyer / retailer** (e.g. VirVentures) | **send** (out) | receive (in) | receive (in) | receive (in) | receive (in) |
| **Supplier / vendor** (e.g. EMRY) | **receive** (in) | send (out) | **send** (out) | send (out) | send (out) |

So a client that "deals with inbound 850s and outbound 856s" is just the supplier
role: for them `850.schema.json` is the product's **OUTPUT** and `856.schema.json`
is the product's **INPUT**. Same files, opposite flow. (This supersedes the earlier
"outbound doc ⇒ input" convention and the separate `*.inbound`/`*.outbound` schema
fork — context.md D9 revised.)

### What direction actually changes

| | Outbound (client SENDS) | Inbound (client RECEIVES) |
|---|---|---|
| Engine runs | build: canonical → X12 | parse: X12 → canonical |
| Map used | the partner's map, forward | the partner's map, reverse |
| Control numbers | assigned by the envelope layer | read from the received file |
| `_meta` (receipt provenance) | **absent** | **populated** (see `common.schema.json#/definitions/inboundMeta`) |
| Required fields | client must supply them (strict API door) | product fills from what arrived |

The business shape is identical; only the `_meta` envelope and required-ness differ.
Required-ness is enforced by the relationship/API door, **not** by forking the schema.

## Files — one pair per doc type

| Doc | Schema | Example |
|---|---|---|
| 850 Purchase Order | `850.schema.json` | `850.example.json` |
| 855 PO Acknowledgment | `855.schema.json` | _todo_ |
| 856 Advance Ship Notice | `856.schema.json` | `856.example.json` |
| 810 Invoice | _todo_ | _todo_ |
| 997 Functional Ack | `997.schema.json` | _todo_ |
| shared sub-objects | `common.schema.json` | — |

Each example must validate against its schema. Maps (the X12 side, direction-specific)
live separately — see `../../examples/856-walkthrough/` and `../../examples/`.

## The four-way split every field obeys

A field belongs in a canonical schema **only** if it's a business fact the client
owns. Everything else lives elsewhere (provenance: the coreapp if/else ladder):

| If a value is… | it lives in… | not here because… |
|---|---|---|
| a business fact the client knows (PO#, qty, ship-to, SKU, cost) | **canonical** ✅ | — |
| a partner's X12 quirk (REF VR/31404, po106 VN, td504 ZZ, MAN01 GM vs CP) | the **map** | varies per partner |
| master data (partner contact, our bill-to address, secrets) | **partner/tenant config** | set once, not per doc |
| a derived value (addr split, CAD→USD, title truncate, state→code, HL numbering) | **enrichment / engine** | computed, not supplied |

**Smell test:** wanting to add a field to satisfy one partner → stop; it's a map entry.

## Type tolerance

Numeric business fields are typed `["number","string"]` on purpose — production data
sends both (e.g. `kon_850lists.po102` appears as `1` and `"1"`). The API door
validates shape; the engine's coercion layer normalizes the value and never throws
(engine-structure.md §3).
