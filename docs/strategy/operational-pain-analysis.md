# Operational Pain → Product Response

> Analysis of `# Research Notes.md` (SMB EDI pain in dropship/supplier ecosystems)
> mapped against our established vision (`product-vision.md`) and target architecture
> (`../design/target-architecture.md`). Business + technical POV, with prioritization.
> 2026-07-30. (The referenced cogentialit blog would not load — TLS cert error on their
> server; its standard "challenges & solutions" ground is covered by the research notes.)

---

## 1. The reframe the research forces — and how we hold it

The notes make one big claim that we must take seriously:

> *"EDI itself is not the biggest problem anymore. The industry has largely solved
> document translation / X12 / AS2 / VAN. The real problems now exist around business
> **operations** — operational orchestration."*

Taken naively, this threatens our vision (which centers on *"we speak EDI for you"*). It
does not — but it **sharpens** it, and we must not ignore it. Reconciliation:

- **What's commoditized is the translation *tech*** (parsers, AS2). Anyone can `node-x12`.
- **What is NOT solved — and the notes confirm it — is:** (a) **per-partner IG variability**
  (their Challenge #1), (b) **onboarding** (their "biggest unsolved problem"), (c) the
  **fear/expertise gap** (their "staffing challenges"), and (d) everything **above**
  translation: inventory sync, exceptions, SKU, visibility, returns.

**So the correction to our vision is one of emphasis, not direction:**

> **Translation + compliance is the ANTE and the WEDGE. The durable VALUE — and the
> defensibility against commoditization — lives one layer up, in operational
> orchestration.** We enter on "we make the scary EDI disappear," but we *retain and
> expand* by orchestrating the operations that EDI documents are really about.

Our architecture already has these layers (Workflow/Orchestration **I**, Validation **H**,
Reference Data **G**, Observability **L**) — the research says: **these are not "Phase-3
expansion," they are the value ladder, and we under-weighted them.**

Positioning adjustment: stop selling *"EDI translation."* Sell *"compliance + operational
orchestration for dropship,"* with translation as the thing that makes it possible.

---

## 2. Pain-by-pain map (business + tech)

Priority key: **T0** = the wedge/core (already central) · **T1** = first expansion (high
ROI, build next) · **T2** = deeper orchestration · **T3** = later/complex.

| # | Pain (from notes) | Real? | Our architecture response | Build cost | Business value / differentiation | Pri |
|---|---|---|---|---|---|---|
| 1 | Retailer-specific EDI implementations (per-partner variability) | ⭐ acute | Canonical + maps + effective-IG cascade + **template catalog** | (core) | **This is our moat.** The variability we're built to tame. | **T0** |
| 2 | Trading-partner onboarding (slow/expensive) | ⭐ #1 unsolved | **AI onboarding agent + sandbox/cert env** | high | **The disruption.** Collapses incumbents' cost structure. | **T0** |
| 3 | Chargebacks (late/missing/wrong ASN, mismatches) | ⭐ direct-$ | Business **validation (H)** + compliance monitoring | med | **Highest-ROI expansion** — chargebacks are direct dollars. Sticky. | **T0→T1** |
| 4 | Data quality (valid EDI, wrong business data) | ⭐ | **Business validation before transmit** (AI-assisted) | med | Prevents #3 at the source. Ties to compliance. | **T1** |
| 5 | Inventory synchronization (overselling, penalties) | ⭐ acute | **Inventory/availability orchestration service** (see §3) | high | High value; prevents suspensions. Competitive (Extensiv et al.) — differentiate by tying to the EDI/compliance flow. | **T1** |
| 6 | Operational visibility (blind until complaints/deductions) | ⭐ | **Observability (L):** dashboards, alerts, replay, control tower | med | Retention + kills support burden. Increasingly table stakes. | **T1** |
| 7 | Exception handling (manual, per the notes' long list) | ⭐ | **Exception intelligence** (AI triage) on **Workflow (I)** | med-high | Retention + margin (support). Root-cause + suggested fix. | **T1→T2** |
| 8 | SKU translation/normalization (mapping breaks) | ⭐ | **Reference Data (G): product identity graph** / cross-ref | med | Enables everything else; prevents silent failures. | **T2** |
| 9 | Order splitting / multi-supplier dropship | real | **Orchestration engine (I)** — native multi-source order logic | high | Real differentiation for dropship, but deep business logic. | **T2** |
| 10 | Multi-warehouse fulfillment | real | Orchestration (I) + availability service | high | Ties to #5/#9. | **T2** |
| 11 | System integration (different APIs/models/ids) | ⭐ | **Connector layer (B)** — our heaviest build | high | Core enabler; the customer-facing edge. | **T0/T1** |
| 12 | ERP integration gaps (returns, credit memo, partial/split still manual) | real | **Deeper connectors + orchestration** — NOT building an ERP (see §3) | med-high | Solve via integration depth, not by becoming an ERP. | **T2** |
| 13 | Returns / reverse logistics (email + Excel) | real | Standardized returns orchestration + new doc types | high | Genuinely unsolved, but complex and lower-frequency. | **T3** |
| 14 | Staffing / EDI expertise rare | ⭐ | The whole value prop — **we are the expertise** | (core) | Reinforces the wedge; why they buy at all. | **T0** |

**Read of the table:** ~all 14 pains map onto layers our architecture *already names*. The
research **validates the architecture**; what it changes is **sequencing and emphasis** —
elevate orchestration (rows 3–8) from "later" to "the value ladder we climb deliberately."

---

## 3. The ERP question — answered directly

**Your instinct is right about the problem; "attach an ERP" is the wrong solution shape.**

### Why NOT build/attach an ERP
- **ERP is a company-ending scope trap.** It's one of the hardest, most capital-intensive,
  most entrenched software categories (NetSuite, Business Central, SAP B1, Odoo — decades
  and billions in). An EDI startup bolting on an ERP would blow all focus and never win on
  ERP features.
- **Channel conflict.** You need to *integrate with* those ERPs (they're connectors). Compete
  with them and you poison the integrations and partnerships you depend on.
- **It's not what solves the pain.** The inventory/pricing pain doesn't need general ledger,
  procurement, HR, or accounting. It needs **fast, accurate availability** — a narrow slice.

### What actually solves it: a focused **Inventory / Availability Orchestration service**
The pain (overselling, stale marketplace stock, penalties) is solved by an **event-driven
availability layer**, not an ERP:
- Aggregates stock from all sources (vendor 846 feeds, marketplace, warehouse, 3PL) into a
  single **real-time availability truth**.
- Applies buffers/safety-stock, reserve-on-order, multi-source rules.
- Pushes fast updates *out* to channels (Shopify/Amazon/…) via the connector layer.
- Lives in our architecture's **Reference Data (G) + Workflow (I)** — a bounded module, not
  a new product category.

### The insight in your "real-time weakest link" concern — this is the key unlock
You said: *"if our EDI is real-time but the client's ERP is slow, it won't solve the
problem."* Correct — **real-time is a property of the weakest link.** The answer is *not* to
fix/replace their ERP. It's to **own the availability layer specifically**, so channel
accuracy is decoupled from their slow ERP:

```
 vendor 846 feeds ─┐
 marketplace stock ─┤→  OUR AVAILABILITY SERVICE  →  fast push to channels (accurate stock)
 warehouse/3PL ─────┘   (fast source of truth)
                              │
                              └── ERP stays system-of-record for FINANCIALS (invoices,
                                  GL) — which can be slower; they don't need sub-second.
```

Split the concern: **availability = fast, us; financial record = the ERP, slower, theirs.**
You solve real-time *without* touching how slow their ERP is.

### Where ERPs DO fit (already in the plan)
As **connectors** (QuickBooks, NetSuite, Business Central, Odoo). The notes' "ERP integration
gaps" (returns/credit-memo/partial-ship still manual) are solved by **deeper connectors +
orchestration on top**, not by becoming the ERP.

### The one legitimate kernel of your idea — a "lite OMS," later
Many SMB "ERPs" are really *QuickBooks + spreadsheets* — there's no good system to connect
to. For those, "connect your ERP" fails. The right answer is **not** a full ERP but an
optional **lightweight inventory & order hub** (an OMS-lite: availability + orders, *not*
accounting/GL) for customers who lack a system. Caveats: (a) it's a **Phase-3+** decision,
not now; (b) it pulls you toward competing with Extensiv/Sellercloud/Linnworks — enter only
deliberately; (c) call it "inventory & order hub," never "ERP."

**Bottom line:** Don't build an ERP. Build a narrow real-time availability service now-ish
(T1), integrate ERPs as connectors, and hold "OMS-lite" as an optional later play for the
ERP-less segment.

---

## 4. What this changes in our plan

1. **Elevate orchestration from "expansion" to "the value ladder."** Translation/compliance
   is the ante; orchestration is where we stop being commoditizable.
2. **Add an Inventory/Availability Orchestration service** as a named component (answer to §3).
   → new open question in the architecture doc.
3. **Adjust positioning:** lead with *"compliance + operational orchestration,"* translation
   as enabler — not *"EDI translation."*
4. **Prioritize by ROI + tie-to-wedge**, not by the notes' full R&D wishlist (see §5).

---

## 5. Prioritization — the value ladder (and the discipline warning)

The notes list ~14 pains and ~14 R&D themes. **Trying to solve them all is the failure
mode** — it's how you build nothing well and become an unfocused "supply chain platform"
with no wedge. Climb deliberately:

- **Rung 0 (wedge — build first):** per-partner EDI compliance + **AI onboarding + sandbox**.
  Get in the door on the scary thing. *(rows 1,2,11,14)*
- **Rung 1 (first expansion — highest ROI):** **compliance/chargeback prevention +
  pre-transmit business validation** — direct-dollar ROI, ties straight to the EDI flow you
  already own. *(rows 3,4)*
- **Rung 2:** **real-time inventory/availability service + operational visibility** — prevents
  overselling/suspensions; makes you the control tower. *(rows 5,6)*
- **Rung 3:** **exception intelligence + SKU identity graph** — retention + margin. *(rows 7,8)*
- **Rung 4 (later):** multi-supplier/multi-warehouse orchestration, returns, OMS-lite. *(9,10,12,13)*

**Sequencing rule:** climb a rung only when a real customer's pain pulls you there. Each rung
should be independently sellable and should reinforce (not distract from) the EDI wedge.

---

## 6. The honest risk

The gravitational pull of this analysis is toward *"become a supply-chain automation
platform"* — which is exactly the market the notes say everyone is chasing. **That pull is
the danger.** Our defensibility is the *EDI wedge + dropship-native orchestration climbed in
sequence*, not a big-bang platform. Stay disciplined: **narrow wedge, deep moat, climb the
ladder one funded rung at a time.**
