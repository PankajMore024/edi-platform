# 856 — who produced every byte, and why it's split that way

This file answers one question: **the engine outputs one flat X12 file — so why
are the inputs split across three files?** Below is the complete
`expected/856.output.edi`, with every segment (and the interesting elements)
traced back to its source.

## Legend — the four sources

| Tag | Source file | What it owns | Changes when… |
|---|---|---|---|
| 🅐 **ENVELOPE** | `envelope.config.json` | ISA/GS/ST/SE/GE/IEA framing, delimiters, sender/receiver IDs, control #s | you add a *trading-partner connection* (rare) |
| 🅑 **MAP** | `856.outbound.map.json` | which segments exist, their order, qualifiers/constants, formats, defaults | you onboard a *new partner* or they change their 856 spec |
| 🅓 **DATA** | `canonical/856.*.json` | the actual business values (PO#, SSCC, qty, addresses) | *every single shipment* (per transaction) |
| 🅔 **ENGINE** | (computed, no file) | HL numbering, parent links, counts, timestamps | never by hand — it's derived structure |

The point of the split: **🅓 changes every shipment, 🅑 changes per partner, 🅐
changes per connection, 🅔 never.** Mixing them is what the current
`edi856Parser.js` does today (data values, partner quirks, and X12 structure all
tangled in one code path). Separating them by rate-of-change is the whole design.

---

## The complete file, annotated

```
ISA*00*          *00*          *ZZ*ACMEEDI        *ZZ*RETAILEREDI    *260615*1430*U*00401*000000001*0*P*>~
└─ 🅐 entirely. Sender/receiver IDs, qualifiers, usage 'P', component sep '>'.
   🅔 stamps the date/time + control number 000000001 at send.

GS*SH*ACMEEDI*RETAILEREDI*20260615*1430*1*X*004010~
└─ 🅐 functional group. 'SH'=ship notice group, version '004010', group control '1'.

ST*856*0001~
   │    └─ 🅐 ST control number 0001
   └─ 🅑 transaction set '856' (= the map's docType)
─────────────────────────── envelope ends / business document begins ───────────────────────────

BSN*00*SHIP-55001*20260615*1430*0001~
    │   │          │        │    └─ 🅑 const '0001' (hierarchical structure code: S/O/P/I)
    │   │          │        └─ 🅓 shipment.time, 🅑 format HHMM
    │   │          └─ 🅓 shipment.date, 🅑 format CCYYMMDD
    │   └─ 🅓 shipment.shipmentId
    └─ 🅓 shipment.purpose (value '00'), 🅑 supplies the default
   ▲ segment exists & is positioned first: 🅑

HL*1**S*1~
   │ │ │ └─ 🅔 HL04 child-flag = 1 (this shipment has children)
   │ │ └─── 🅑 HL03 level code 'S'  ("hl":"S")
   │ └───── 🅔 HL02 parent id = empty (top of tree)
   └─────── 🅔 HL01 sequence = 1 (engine counter)

TD1*CTN25*****G*42.5*LB~
    │        │ │     └─ 🅓 weight.uom
    │        │ └─────── 🅓 weight.value, 🅑 decimal 1
    │        └───────── 🅑 const 'G' (gross weight qualifier)
    └────────────────── 🅑 default 'CTN25' (canonical had no value)
   ▲ included only because 🅓 shipment.weight exists ("when": "$item.weight" → 🅑)

TD5*B*2*UPSN*M*UPS GROUND~
    │ │ │    │ └─ 🅓 carrier.routingDescription
    │ │ │    └─── 🅓 carrier.method
    │ │ └──────── 🅓 carrier.scac
    │ └────────── 🅑 const '2' (id qualifier = SCAC)
    └──────────── 🅑 const 'B' (routing sequence)

REF*BM*BOL-99~                 ┐ structure (REF, repeats over references): 🅑
REF*CN*1Z999AA10123456784~     ┘ qualifiers BM/CN and values: 🅓 (shipment.references[])

N1*ST*Retailer Store 12*92*STORE12~
   │  │                 │  └─ 🅓 shipTo.id
   │  │                 └──── 🅑 const '92' (id assigned by buyer)
   │  └──────────────────── 🅓 shipTo.name
   └─────────────────────── 🅑 const 'ST' (ship-to)
N3*1 Main St~              ← 🅓 shipTo.address1
N4*Austin*TX*78701*US~    ← 🅓 city/state/zip, 'US' via 🅑 default

N1*SF*Acme Distribution Center*92*DC1~   ← 🅑 const 'SF'/'92'; 🅓 name/id
N3*100 Warehouse Rd~                      ← 🅓 shipFrom.address1
N4*Memphis*TN*38118*US~                   ← 🅓 + 🅑 default 'US'
   ▲ whole SF loop included only because 🅓 shipFrom exists ("when" → 🅑)

HL*2*1*O*1~
   │ │ │ └─ 🅔 has children (packs)
   │ │ └─── 🅑 level 'O' (order)
   │ └───── 🅔 HL02 = 1  (points back to the Shipment HL above)
   └─────── 🅔 HL01 = 2

PRF*PO-10001***20260607~
    │          └─ 🅓 order.poDate, 🅑 format
    └──────────── 🅓 order.poNumber

HL*3*2*P*1~                        🅔 HL01=3, HL02=2 (→order); 🅑 level 'P'
MAN*GM*00000123450000000018~
    │  └─ 🅓 pack.sscc  (read, never generated — see engine-notes.md)
    └──── 🅑 const 'GM' (SSCC-18 / GS1-128)

HL*4*3*I*0~
   │ │ │ └─ 🅔 HL04 = 0 (leaf: no children)
   │ │ └─── 🅑 level 'I'
   │ └───── 🅔 HL02 = 3 (→ pack)
   └─────── 🅔 HL01 = 4
LIN**UP*00012345600012*VN*V-1*BP*B-1~
      │  │              │  │  │  └─ 🅓 item.buyerPart
      │  │              │  │  └──── 🅑 const 'BP'
      │  │              │  └─────── 🅓 item.vendorPart
      │  │              └────────── 🅑 const 'VN'
      │  └───────────────────────── 🅓 item.upc
      └──────────────────────────── 🅑 const 'UP'
SN1**10*EA**10~
      │  │   └─ 🅓 item.qtyOrdered
      │  └───── 🅓 item.uom (here matches default 'EA' from 🅑)
      └──────── 🅓 item.qtyShipped
PID*F****Blue Widget~
    │    └─ 🅓 item.description
    └────── 🅑 const 'F'

HL*5*2*P*1~                        🅔 HL01=5, HL02=2 (→ SAME order, 2nd carton)
MAN*GM*00000123450000000025~       🅓 second pack.sscc
HL*6*5*I*0~                        🅔 HL01=6, HL02=5 (→ pack 5)
LIN**UP*00012345600029*VN*V-2*BP*B-2~   🅓 second item
SN1**5*EA**5~                           🅓
PID*F****Red Widget~                    🅓

CTT*6~
    └─ 🅔 count of HL segments emitted ($hlSegments).  Segment exists: 🅑

SE*29*0001~
   │  └─ 🅐 ST control 0001 (matches the ST)
   └──── 🅔 total segment count (ST..SE inclusive)
GE*1*1~          ← 🅐 (group control), 🅔 group count
IEA*1*000000001~ ← 🅐 (interchange control)
```

---

## The same split, summarized as a table

| Segment(s) | 🅐 Env | 🅑 Map | 🅓 Data | 🅔 Engine |
|---|---|---|---|---|
| ISA / GS / GE / IEA | **all** | — | — | ctrl#, timestamp |
| ST / SE | ctrl# | '856' | — | seg count |
| BSN | — | format, const BSN05 | id, dates, purpose | — |
| **HL (all)** | — | level code (HL03) | — | **HL01/HL02/HL04** |
| TD1 / TD5 | — | quals, consts, defaults | weight, carrier | — |
| REF | — | structure | quals + values | — |
| N1/N3/N4 (ST, SF) | — | consts ST/SF/92 | names, addresses | — |
| PRF | — | format | PO#, PO date | — |
| MAN | — | const 'GM' | SSCC | — |
| LIN / SN1 / PID | — | consts UP/VN/BP/F | UPC, parts, qty, desc | — |
| CTT | — | structure | — | HL count |

## Why this particular split (the rationale, one line each)

- **🅐 Envelope is separate** because it's about the *pipe*, not the *document* —
  the same ISA/GS framing wraps your 856, 850, 810 alike. It already lives in
  `kon_x12settings` and works; touching it per-doc would be a regression.
- **🅑 Map is separate** because *this is the product*. Partner A wants `92`,
  Partner B wants `91`; A includes ship-from, B doesn't; A's SSCC qualifier is
  `GM`, B's is `ZZ`. Today each of those is a column + an `if` in the parser.
  Pulling them into one JSON file per partner is what lets you onboard with **zero
  code** — the entire commercial thesis.
- **🅓 Data is separate** because it changes on *every shipment* and must come from
  the customer's system, not from us. It is deliberately X12-ignorant: the customer
  sends `qtyShipped: 10`, never `SN1*…*10`.
- **🅔 Engine values are computed, never authored**, because HL numbering and counts
  are mechanical and error-prone by hand — and identical for every partner. Letting
  a map author write `HL*4*3*I*0` would re-tangle structure into config, which is
  the exact thing we're removing.

> Read top to bottom, the file is one document. But it has **four authors** writing
> at four different speeds. The split is just "let each author own only what changes
> at their speed."
