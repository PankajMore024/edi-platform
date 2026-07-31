# Business Analysis — Dropship EDI SaaS (US / Canada)

> Strategic business analysis, companion to `docs/design/saas-architecture-analysis.md`
> (which covers the *technical* target state). This document covers **market,
> competition, wedge, GTM, pricing/unit-economics, and the AI angle.**
> IP/ownership gate: **RESOLVED — cleared to commercialize (confirmed 2026-07-28).**
> Numbers labeled *(est.)* are reasoned estimates, not sourced figures — validate before betting on them.

---

## 0. The one-sentence thesis

**You are not a generic "EDI platform." You are the vendor-integration + inventory/price/
order pipe for the dropship *reseller-in-the-middle* — the seat you already sit in —
and AI-automated onboarding is what lets you undercut the incumbents' entire cost
structure in the SMB/mid segment the incumbents ignore.**

Everything below defends and sharpens that sentence.

---

## 1. The seat you actually sit in (ICP clarity — this is the whole game)

Dropship EDI has **three distinct seats**, and most tooling is built for the other two:

| Seat | Who | Served by |
|---|---|---|
| **Big retailer** | Target, Wayfair, big-box running a dropship program | CommerceHub/**Rithum**, Logicbroker (retailer-side networks) |
| **Supplier → retailer** | A brand feeding one/many retailers | SPS Commerce, TrueCommerce, DSCO, SPS network |
| **Reseller / aggregator in the middle** ← **YOU** | Buys from 60–70 vendors, lists on Amazon/Walmart/etc. | **Underserved.** Cobbled from marketplace tools + manual EDI + spreadsheets |

Your engine is built **buyer-side** (you place POs, you receive invoice/ASN/inventory/price).
You flagged this as a limitation ("flow is one-sided"). **It is not a limitation — it is
your ICP fit.** Every other dropship reseller has the exact same one-directional buyer-side
flow: source from many vendors, fan out to many marketplaces. The architecture already
matches the customer.

The reseller seat is underserved because:
- **Marketplace tools** (Extensiv Order Manager/Skubana, Sellercloud, Linnworks, Zentail,
  ChannelAdvisor) are strong on *listing / marketplace orders / channel inventory* but
  weak on **structured vendor EDI ingestion** — they lean on CSV/flat-file/manual.
- **EDI incumbents** (SPS, Rithum, TrueCommerce) are built for the retailer or the
  supplier, priced for enterprise, and onboard in weeks-to-months.
- Nobody cheaply solves *"I just signed a new vendor; ingest their 846/810/855/856 feed and
  keep my marketplace inventory and pricing correct so I don't get suspended or charged back."*

That gap is your wedge.

---

## 2. Market & competition

### 2.1 Landscape (who you'll be compared to)

**Enterprise full-service EDI**
- **SPS Commerce** — the 800-lb gorilla. Largest retail EDI network; managed-service model;
  huge partner-IG catalog. Moat = network + managed onboarding. Expensive, slow, enterprise/SMB-retail.
- **TrueCommerce** — full-service mid-market; rolled up B2BGateway, DiCentral-style assets.
- **Cleo** (Integration Cloud) — enterprise integration, EDI + API, technical.

**Modern / API-first EDI**
- **Orderful** — "modern EDI API," one connection, real-time. Closest to your API-first vision; developer-leaning.
- **Stedi** — developer-first EDI infrastructure, usage-based, excellent DX. You build on it; not turnkey for a non-technical operator.

**Dropship / marketplace networks (most direct)**
- **CommerceHub → Rithum** (merged with ChannelAdvisor) — THE big-box dropship network. **DSCO** (supplier data platform) sits here. Dominant incumbent on the retailer side.
- **Logicbroker** — dropship/marketplace-specific connectivity platform. Direct thematic competitor.
- **Convictional** (acquired by Fabric, 2022) — modern API dropship onboarding. *Its acquisition validates the thesis and shows the top of this market already consolidated.*

**Marketplace / channel ops (adjacent, will encroach)**
- Extensiv (Skubana), Sellercloud, Linnworks, Zentail, Spark Shipping, Onport — own the marketplace side; the risk is one of them bolts on vendor-EDI and eats the wedge.

### 2.2 Where the gap is (your white space)

> **Turnkey, low-setup vendor-EDI-to-marketplace connectivity for SMB/mid dropship
> resellers in North America, where AI does the onboarding the incumbents charge humans to do.**

- Incumbents: too expensive, too slow, enterprise sales, per-partner setup fees.
- API players: powerful but "bring your own engineers."
- Networks: you join on *their* terms (retailer-driven).
- Channel tools: weak on structured vendor EDI.

No one owns *"the dropship reseller who sources from dozens of vendors and needs them
onboarded in hours, not weeks, without an integration team."*

### 2.3 Sizing *(est. — validate)*

- Global EDI software market ≈ **$1.5–2B**, ~10–12% CAGR — large but mature; don't anchor here.
- Relevant SAM is far narrower: **SMB/mid dropship resellers & marketplace sellers in US/Canada
  with real multi-vendor EDI needs** — plausibly **tens of thousands** of businesses
  (a subset of the hundreds of thousands of serious Amazon/Walmart 3P sellers).
- SOM math: **~3,000 customers × ~$1,000/mo ≈ $36M ARR** as a focused-player ceiling in a
  few years; **300 customers × $1k/mo ≈ $3.6M ARR** as an early, very reachable milestone.
- **Takeaway:** big enough to build a real, profitable, focused SaaS; **too small to interest
  SPS/Rithum to fight you down-market early** — which is exactly why the wedge is safe *for now.*

---

## 3. Wedge & GTM

### 3.1 The wedge (what to sell first)

**Sell the acute pain, not "EDI."** The reseller's bleeding wounds:
1. **Slow vendor onboarding** — a new vendor's feed takes weeks of manual mapping.
2. **Inventory/price drift** → marketplace **suspensions** and lost Buy Box.
3. **Chargebacks / compliance** — bad ASN, late acks, wrong pricing = real dollars.

Lead with **#1 + #2**: *"Onboard a new vendor in hours; keep your marketplace inventory
and pricing correct automatically."* That's a checkbook-opening promise. Compliance (#3)
is the expansion product (§6).

### 3.2 Your unfair advantage

- **You are the ICP.** You feel the pain daily and you can dogfood ruthlessly.
- **You already have 60–70 real, working vendor integrations.** That is a **seed
  partner-template catalog no SMB-focused competitor has.** Productizing your own maps
  is the cold-start solution most EDI startups never get.

### 3.3 First 3–4 customers

- Founder-led, hand-sold **design-partner program** — other dropship resellers in your
  network / communities (Amazon/Walmart seller groups, dropship Slack/Discords, agency partners).
- Qualify hard: multi-vendor, on Amazon/Walmart, feeling onboarding or suspension pain *now*.
- Price low or free for design partners in exchange for reference + template contributions.

### 3.4 Sequencing (don't build the platform; build the slice)

Your own docs are right: the multi-tenant target state is a **rebuild**. Business-wise, do
**not** build all of it. Build the wedge slice:
1. **Dogfood-first:** run your own business on the config-driven engine (the canonical+map
   design you already spec'd). Prove one full round-trip.
2. **Design partners (3–4):** onboard *their* vendors — many will overlap yours → catalog compounds.
3. **Catalog network effect:** once vendor X is mapped, the next reseller using vendor X
   onboards in minutes. This is the SPS moat aimed at the SMB reseller.
4. **Compliance/visibility product line** as the sticky, higher-ARPU expansion.

---

## 4. Pricing & unit economics

### 4.1 How the market prices EDI

| Model | Who | Notes |
|---|---|---|
| Per-document / per-kilochar | legacy VANs | Hated, opaque. Avoid. |
| **Per-trading-partner + platform fee + setup fee** | SPS, TrueCommerce | Setup fees exist *because a human maps each partner.* |
| **Usage / volume tiers** | Stedi, Orderful | Modern, low entry, scales with the customer. |
| Flat SaaS tiers | many SMB tools | Simple, predictable. |

### 4.2 Recommended model

**Tiered SaaS by # of active vendor connections × marketplace channels, with a document-volume
guardrail — and low/no setup fee.**

Illustrative *(est., anchor to willingness-to-pay in design partners)*:
- **Starter** ~$199–499/mo — up to ~5 vendors, 1–2 channels.
- **Growth** ~$999–2,000/mo — up to ~20 vendors, multi-channel, compliance monitoring.
- **Scale** custom — 20+ vendors, SLAs, priority support.

### 4.3 The insight that IS the business model

> The dominant variable cost in EDI SaaS is **onboarding labor** — mapping a partner's
> IG/feed. Incumbents charge setup fees precisely because it's human work.

If your AI auto-maps from sample files + IG (§5.1), **your cost-to-onboard collapses toward
zero.** That lets you offer **low/no setup fee** — a wedge the incumbents structurally cannot
match without cannibalizing their services revenue — **while keeping 70–80%+ gross margin.**
AI here is not a feature; it is the cost-structure disruption.

**Watch (the margin killers):**
- **Support-ticket avalanche** if observability is weak (your own docs flag this). Invest in
  self-serve visibility + AI triage (§5.3) early or support eats the margin.
- **Onboarding automation is harder than it looks** — IGs are messy; keep a human-in-the-loop
  review step so a bad auto-map never silently ships.

---

## 5. The agentic-AI angle — real vs hype

**Principle: AI at the edges (onboarding, monitoring, triage); the translation hot path stays
deterministic, versioned, golden-file-tested.** Never let AI generate maps that run unreviewed
in production, and never do non-deterministic "AI translation" of financial docs (unauditable,
legal exposure). Your own design (no arbitrary code in maps) already points the right way.

Ranked by value:

1. **Auto-mapping / IG ingestion — the crown jewel.** Agent reads a vendor's IG PDF + sample
   files → proposes a canonical↔X12 map → human reviews/approves → deterministic engine runs it.
   This attacks the #1 cost and the #1 scaling wall simultaneously. **This is where AI = moat.**
2. **Compliance / anomaly monitoring.** Agent watches document flows; flags ASN↔PO mismatches,
   price drift, missing/late acks, likely-chargeback conditions **before** they hit. Dropship
   money bleeds here — this can be its own product line and higher ARPU.
3. **Self-healing / error triage.** Agent reads a failed translation or 824/997 reject,
   diagnoses, proposes a map or data fix, opens a ticket with the fix pre-drafted. Directly
   kills the support avalanche that would otherwise cap your margin.
4. **Natural-language ops.** "Why didn't vendor X's inventory update today?" answered by an
   agent over your observable event log. Great DX/retention, lower strategic weight.

**Hype to avoid:** real-time AI translation in the hot path; unreviewed AI-authored production
maps; "AI does EDI" as a slogan without the deterministic engine underneath.

---

## 6. Moat & defensibility

1. **Shared vendor-template catalog** seeded from your own 60–70 integrations → supply-side
   network effect (each new mapped vendor makes onboarding faster for everyone).
2. **AI auto-onboarding** that structurally undercuts incumbent setup-fee economics.
3. **Compliance/visibility layer** — sticky, high-value, hard to rip out once it's preventing
   chargebacks and suspensions.
4. **ICP intimacy** — you build for a seat the incumbents don't staff for.

---

## 7. Risks / what could kill this

- **Channel tools encroach** (Extensiv, Sellercloud, etc. add vendor-EDI). *Mitigate:* go
  deeper on EDI + compliance than a bolt-on can, and own the catalog.
- **Incumbents move down-market** (Rithum/Logicbroker). *Mitigate:* the SMB segment is
  unattractive to them until you're big; move fast on the catalog moat.
- **Onboarding automation underdelivers.** *Mitigate:* human-in-the-loop; sell the assisted
  speed, not "zero-touch magic," until the model earns trust.
- **Support burden / observability debt.** *Mitigate:* visibility + AI triage as first-class, early.
- **Focus risk (small team building a platform).** *Mitigate:* build the wedge slice, not the
  target-state platform; resist feature sprawl.
- **Compliance/legal:** retain raw bytes forever (audit/chargeback disputes); per-tenant
  secrets in a real secrets manager. (Both already called out in the architecture doc.)

---

## 8. Recommended next moves (business, not code)

1. **Validate willingness-to-pay** with 5–10 discovery calls to dropship resellers you know —
   test the "onboard-a-vendor-in-hours + no-suspensions" promise and the price tiers in §4.2.
2. **Line up 3–4 design partners** whose vendors overlap yours (fastest catalog compounding).
3. **Pick the primary GTM message** (open question S2): "EDI as API" (developer buyers) vs
   "EDI as a Service" (operator buyers). For the SMB reseller ICP, **operator/turnkey ("as a
   Service") is the likelier first wedge** — but confirm in discovery.
4. **Decide the AI-onboarding MVP scope** — even a human-assisted auto-mapper that turns
   sample files into a draft map is enough to prove the cost-structure thesis.
5. Keep the **rebuild-vs-harvest** discipline: productize the canonical+map engine as the wedge
   slice; harvest domain logic from the current repo; don't port the hardcoded parsers.

---

## Open strategic questions (carried forward)

- **S1.** Wedge = traditional X12 retail vs dropship/marketplace (API-heavy). *This analysis
  argues strongly for the **dropship-reseller** wedge.*
- **S2.** Primary GTM: "EDI as API" vs "EDI as a Service." *Leaning "as a Service" for the SMB
  reseller ICP — confirm in discovery.*
- **S3.** Shared template catalog early (moat) vs bespoke maps per client (faster revenue).
  *Your own 60–70 maps let you do both — dogfood seeds the catalog for free.*
- **S4.** Compliance/scorecard as a product line — recommended as the **expansion** product, not MVP.
