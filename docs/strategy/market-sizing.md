# Market Sizing & Audience — Researched (2026-07-28)

> Sourced findings from a deep-research pass (fan-out web search → source fetch →
> 3-vote adversarial verification). Companion to `business-analysis.md`.
> **Confidence discipline:** every number below is tagged. "VERIFIED" = survived
> adversarial verification against a primary/credible source. "REFUTED" = a figure
> that was found but failed verification — **do not cite it.** "ESTIMATE" = my
> triangulation, not a sourced fact.

---

## The headline finding (read this first)

**The audience is real and provably pays — but X12 EDI is NOT the pain for most of it.**
Two things the research changed about our picture:

1. **The willingness-to-pay is confirmed and healthy.** Incumbents in and adjacent to
   this seat are large and profitable (SPS $637.8M rev; Rithum $50B+ GMV), and
   multichannel tooling for this exact seller segment reaches **$2,000/mo** — i.e. the
   top of the $200–$2,000/mo band we assumed is real, not aspirational.

2. **Most of this ICP integrates vendors via API/CSV/portal, not X12 EDI.** The best
   real archetype we found (PARTS iD / CARiD — 1,000+ vendors, ~18M SKUs, inventory-free)
   ran the *entire* multi-vendor integration on **APIs, with zero EDI**. Multiple
   independent sources say **X12 EDI only becomes relevant as these businesses move
   upmarket** into wholesale-supplier or big-retail vendor-direct programs. One source is
   literally titled *"No, You Don't Need EDI to Dropship."*

**→ Strategic consequence:** if the product is positioned as *"X12 EDI,"* it addresses
only the upmarket slice of the ICP. If positioned as *"multi-vendor feed integration
(API + CSV + portal + EDI), with EDI as the hard format we also do,"* it addresses the
whole seat. This is the single most important audience insight from the research.

---

## What's VERIFIED

**Willingness-to-pay / incumbent scale**
- **SPS Commerce:** $637.8M FY2024 revenue (+19% YoY), **~45,350 recurring-revenue
  customers**, 94% recurring. *(VERIFIED — earnings release + 10-K.)* Caveat: skews to
  enterprise supplier/retailer EDI, not our SMB reseller ICP — proves the *category*
  monetizes, not our exact seat.
- **Rithum** (CommerceHub + ChannelAdvisor + DSCO, merged Dec 2023): **40,000+ connected
  companies, $50B+ annual GMV, 420+ channels.** *(VERIFIED — self-reported marketing
  metrics.)* The most direct dropship-connectivity incumbent to our seat.
- **Zentail Pro:** **$2,000/mo** for established multichannel sellers. *(VERIFIED.)*
  Confirms the top of our price band. (Its "$300/mo Base" figure was **REFUTED** — don't cite.)

**The archetype pays for multi-vendor integration**
- **PARTS iD (CARiD):** 1,000+ vendors, ~18M SKUs, 5,000+ brands, **inventory-free**;
  dropship vendors = "vast majority" of revenue, private label <10%. *(VERIFIED — 10-K.)*
  **Two big caveats:** (a) integrated via **API, not EDI**; (b) **filed Chapter 11 in
  Jan 2024** — validates the *model and vendor-network scale*, and warns that the
  standalone single-vertical dropship model has real durability risk.

**Marketplace top-of-funnel (gross, not qualified)**
- **Walmart Marketplace:** **~200,000 active sellers** mid-2025 (first time over 200k),
  after 60% growth in 2024 to ~160k; projected 250k+ by end-2025. *(VERIFIED — Marketplace
  Pulse.)*
- **…but heavily offshore:** **34% of active Walmart sellers are China-based**, and **~60%
  of 2025 joiners** are China-based. *(VERIFIED.)* The US/Canada qualified pool is far
  below the 200k headline.
- **eBay:** ~17.6–18.3M active sellers worldwide, ~31% US (~5.5M). *(VERIFIED, but
  estimate-on-estimate.)* Mostly irrelevant to our niche — treat as a loose upper bound.

**Feed-integration reality**
- **X12 EDI = batch/legacy, upmarket-only** for this ICP; API/CSV/portal is the default.
  *(VERIFIED across ≥4 sources.)*

**Market growth (directional)**
- Global dropshipping market growing **~20–23% CAGR**, **North America ~35% share
  (dominant region)**. *(VERIFIED as directional substance.)*

---

## What we could NOT pin down (honest gaps)

- **Amazon seller counts: unanswered.** Every specific figure tested (~1.9M active,
  9.7M registered, 1.36M US) was **REFUTED.** Amazon does not publish counts; the blog
  numbers didn't hold up.
- **No verified NA dropship *dollar* market size.** MarketDataForecast's $90.45B (2024) /
  $109.25B (2025) / $494.72B (2033) figures were **REFUTED** — spurious precision,
  single-source. Only *global, consumer-wide* growth figures survived.
- **No clean top-down count of our specific ICP exists.** US/Canada SMB, $1–50M GMV,
  multi-vendor, no owned brands — must be triangulated bottom-up.
- **Direct-competitor customer counts are thin.** Logicbroker, Orderful, Stedi, Flxpoint,
  Inventory Source, Extensiv/Skubana, Sellercloud — no usable verified numbers survived.
  (These are the ones actually in our seat — worth a dedicated dig later.)

---

## Bottoms-up triangulation (ESTIMATE — validate, don't bank)

No top-down number exists, so here is a transparent bottom-up cut. Every step is an
assumption; the point is the *order of magnitude*, not precision.

| Step | Figure | Basis |
|---|---|---|
| Walmart active sellers | ~200,000 | VERIFIED |
| — remove offshore (~34%) | ~132,000 US/CA | VERIFIED share |
| — keep wholesale/dropship resellers (~25–30%; the rest are private-label / arbitrage / single-vendor) | ~35,000–40,000 | Jungle Scout model-mix (indicative: ~26% wholesale, ~17% dropship, ~55% private label) |
| — keep those with dozens-to-100 vendors + real feed pain + $1–50M GMV (~10–20%) | **~4,000–8,000** | ESTIMATE |
| + Amazon, eBay, standalone Shopify/dropship e-tailers | additive, unquantified (Amazon leg unverified) | — |

**Order-of-magnitude SOM: low single-digit thousands → low tens of thousands of
qualified US/Canada businesses.**

**Dollar implication:** at $500–$2,000/mo ($6k–$24k ARR):
- 1,000 customers → **$6–24M ARR**
- 3,000 customers → **$18–72M ARR**

**Verdict: big enough for a strong, focused, profitable SaaS — not a hyperscale market.**
That asymmetry is the opportunity: too small for SPS/Rithum to chase down-market soon,
big enough to build a real business. Win by depth + retention, not funnel volume.

---

## What this means for the audience question

1. **Yes, there are enough of them** — thousands of qualified US/CA businesses, with proven
   willingness to pay in our price band.
2. **But define the audience by the *job*, not the *format*:** "I source from dozens of
   vendors and need their feeds integrated + my channels kept accurate." EDI is one hard
   format inside that job, not the job itself.
3. **The number can't be bought off a shelf — it has to be validated bottom-up.** The
   absence of a clean market figure is itself the finding: go get 10–15 discovery calls and
   a named target list; that will beat any analyst report for this niche.

## Sources (verified-claim backbone)
- SPS Commerce FY2024 earnings release + 10-K (SEC) — *primary*
- PARTS iD FY2022 10-K (SEC) — *primary*
- Rithum.com / BusinessWire merger release — *primary (self-reported)*
- Zentail.com/pricing — *primary*
- Marketplace Pulse (Walmart seller growth, China share) — *secondary, industry-standard*
- Flxpoint / Inventory Source / Celigo / Modern Dropship (EDI-vs-API) — *trade blogs, corroborated*
- Technavio / Grand View / Mordor (dropship growth, NA share) — *syndicated, directional only*
