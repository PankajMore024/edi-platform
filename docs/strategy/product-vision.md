# Product Vision — The Connector-Based EDI Compliance Platform

> **Read this when you doubt the vision.** This is the grounding document: the *why*,
> the insight that makes it a business, and the final approach — written to re-convince
> you on the days it feels hard. Companion to `business-analysis.md` (thesis),
> `market-sizing.md` (evidence), and `../design/target-architecture.md` (the how).
> Decided 2026-07-28.

---

## The product, in one sentence

> **"Keep your spreadsheet. We speak EDI to your big partners for you."**

A connector-based EDI service that lets a dropship SMB keep working in the tools they
already use (CSV, their DB, Shopify, QuickBooks, an API) while we translate — in **both
directions** — to and from whatever EDI their powerful trading partners mandate.

---

## The Why — where the pain actually lives

The pain is not abstract "we should modernize EDI." The pain has a **precise moment**:

> A dropship SMB wins a program with a big partner — a **Target Plus / Walmart DSV /
> Wayfair / Home Depot** dropship deal, or a large distributor's vendor program — and
> discovers there is an **EDI requirement standing between them and the revenue.** They
> don't understand it. It's arcane, it's scary, and the deal is on hold until they're
> "EDI compliant."

That moment is the single most reliable "take my money" trigger in B2B integration. It is
**exactly how the entire EDI SaaS industry was built** — SPS Commerce ($637M revenue,
~45,000 customers), TrueCommerce, B2BGateway, DiCentral all grew on this one pain:
*"A big partner is forcing me onto EDI. Make me compliant."*

We are not inventing a market. We are entering the **largest, most-proven pain in the
category** — through the door of the dropship niche we actually live in.

**This aligns with the evidence, not against it.** The research said EDI becomes relevant
"as these businesses move upmarket into large-retail programs." That upmarket moment *is*
the mandate. Our instinct and the data point at the same spot.

---

## The insight that makes it a business

For a while the open question was: *"Is this an EDI product or a CSV/API product? EDI is a
tiny, scary niche; CSV/API is a commodity race to the bottom."* The **connector model
dissolves that false choice.** There are two edges and a hub:

```
   The SMB's own world           US (the canonical hub)         The big partner's world
 ┌────────────────────┐        ┌────────────────────┐        ┌─────────────────────┐
 │ CSV / DB / Shopify │  ───►  │  canonical business │  ───►  │  Walmart / Target   │
 │ QuickBooks / API   │        │  document           │        │  EDI (their exact   │
 │                    │  ◄───  │  (850/855/856/810…) │  ◄───  │  IG + version)      │
 └────────────────────┘        └────────────────────┘        └─────────────────────┘
   the EASY, familiar end          the engine + maps            the SCARY end they pay for
        (connectors)                   (the moat)                    (partner maps)
```

- The **customer-facing edge speaks CSV / API / DB** — familiar, non-scary. The SMB
  **keeps their spreadsheet, their Shopify, their QuickBooks.** They never learn EDI.
- The **partner-facing edge speaks EDI** — the terrifying part. **That** is what they pay
  us for.

CSV/API is therefore **not a separate product competing with our EDI product** — it is the
**input side of the same pipe.** We are one translation service whose value is: *the SMB
never has to touch the thing they fear.*

---

## Why the variability is the moat, not a weakness

Every partner has a different Implementation Guide. Every SMB has a differently-shaped
internal data source. There is **no one-size-fits-all template** — and that used to feel
like the flaw in the plan.

**Flip it.** If it *were* one-size-fits-all, it would be a free plugin and there would be
no business. The variability is *exactly why SPS can charge setup fees*, and *exactly why
generic integration shops and AI-wrapper startups run away from EDI.* Our entire
architecture — canonical model + declarative maps + AI-assisted onboarding — exists to
**tame that variability by turning every partner and every data source into config, not
code.** The thing that felt like the weakness is the thing we build the moat around.

And the moat is real and hard to fake: a generic provider *cannot* credibly say *"we run
810/846/850/855/856/997 across dozens of live trading partners."* **We can** — that is
hard-won domain knowledge from 60–70 real vendor integrations, and it is expensive for a
competitor to acquire.

---

## Who we serve — both roles, bi-directional

The same customer wears two hats, and we serve both. (This is what "serves both vendors and
suppliers" means in practice.)

| Role | The customer is… | Flow | Status |
|---|---|---|---|
| **Sell-side** (supplier-side) | a **supplier** to a powerful buyer (big retailer / marketplace program) that **mandates EDI** | receive **850** (PO) → return **855 / 856 / 810 / 997** | **The acute, wallet-open pain. Recommended first wedge.** *(net-new direction vs today's engine)* |
| **Buy-side** (procurement-side) | a **buyer** placing orders with its own vendors | send **850** → receive **855 / 856 / 810 / 846** | What today's engine already does — harvest it. |

The engine is **symmetric**: it only ever does *canonical ↔ EDI* and *canonical ↔ customer
data*, in both directions. A "role" is just configuration of which partner plays which part
and which document flows which way. That symmetry is why supporting both is an architecture
decision, not two separate products.

**Wedge recommendation:** lead **sell-side** (the mandate moment) — that is where the pain
and the willingness-to-pay concentrate — even though it is the mirror of what runs today.

---

## Why us, not SPS / TrueCommerce

We are entering their market, so this must be answered honestly:

1. **Dropship-native.** They are generalist retail EDI. We understand dropship flows,
   marketplace programs, and inventory/price sync *alongside* the EDI — and we serve the
   reseller's **whole** EDI life (both roles above), which the generalists treat as two
   unrelated customers.
2. **AI-collapsed onboarding.** Their onboarding is slow, human, and expensive — that is
   their cost structure *and* their weak flank. An agent that turns a partner IG + samples
   into a working map in hours undercuts the very thing that makes them slow and pricey.
   **This is the disruption — not "we also do EDI."**
3. **The under-served low end.** SPS is painful and costly for the smallest suppliers.
   There is a persistent gap beneath them, and it is exactly our niche.

---

## The role of agentic AI — on the outskirts, never in the hot path

AI is a **cost-structure weapon at the edges**, not a runtime translator. The deterministic,
golden-file-tested engine stays in the middle. AI lives on the outskirts:

- **Onboarding agent** — ingests a partner's IG + EDI samples → drafts the **partner map**;
  ingests the customer's data samples → drafts the **connector map**. A human reviews and
  approves. This is what collapses onboarding cost and keeps us a product, not a consultancy.
- **Sandbox / certification agent** — generates representative test transactions, runs them
  through the engine, diffs against expected output, surfaces failures, and proposes fixes —
  so a new connector or map is *proven* before it touches production.

**Iron rule:** AI *proposes*, the deterministic engine *executes*, a human *approves
promotion*. Never non-deterministic translation of live financial documents.

---

## What we are NOT (scope discipline)

- Not a general-purpose iPaaS. Not a marketplace listing tool. Not a WMS/OMS.
- Not "AI does EDI" magic — the engine is deterministic; AI is onboarding + testing.
- Not enterprise-first — we win the low/mid end the incumbents neglect.
- Not trying to boil the connector ocean — a small set of *excellent* connectors first.

---

## The final approach (the decision)

**A connector-based EDI product that:**
1. Serves **both roles** — the customer as supplier (sell-side) and as buyer (buy-side).
2. Is **bi-directional** — canonical ↔ EDI and canonical ↔ customer-data, each way.
3. Is **connector-first** — the customer keeps their CSV/DB/API/e-commerce world; a small
   set of pre-built top connectors ships with prod, and new ones are config + a thin
   adapter, not forks. *(This is our heaviest build — see the architecture doc.)*
4. Is **powered by agentic AI on the outskirts** — onboarding (auto-draft maps) and a
   sandbox/certification environment — with a deterministic engine at the core.
5. Wins on **dropship-native design + AI-collapsed onboarding**, entering through the
   sell-side EDI-mandate pain.

---

## When you doubt this — remember

- The pain is **proven and specific**: the EDI mandate is the biggest, oldest "take my
  money" trigger in the category. You are not betting on a maybe.
- The fear you're selling into is **real and durable**: generic providers won't touch EDI,
  and SMBs won't learn it. That gap doesn't close on its own.
- Your **unfair advantage is already built**: 60–70 live integrations of domain knowledge no
  competitor at this level has.
- The **variability is the moat**, not the obstacle.
- **Eyes open on the risks:** the market is crowded with entrenched incumbents (moat must be
  dropship-native + onboarding speed, not "we do EDI"); the connector long-tail is real
  (start with 1–2 platforms your first customers actually use); EDI has managed-services
  gravity (the AI onboarding is the only thing keeping this a product). None of these kill
  the thesis — they scope the execution.
