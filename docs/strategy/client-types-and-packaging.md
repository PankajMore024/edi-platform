# Client Types, Modularity & Packaging

> How we serve multiple client types without forking the product. Answers the
> "modular single app vs tailor-per-client" question and the "Rungs 0–3 at launch"
> belief. Companion to `product-vision.md`, `operational-pain-analysis.md`, and
> `../design/target-architecture.md`. 2026-07-30.

---

## The decision (stated plainly)

> **One modular, multi-tenant platform. A client "type" is a CONFIGURATION — a bundle of
> enabled modules + maps + rules — NOT a separate build. We never tailor/fork per client.**

Tailoring per client is the death of a SaaS: you become a consulting shop with N unmaintainable
codebases, you can't ship a platform-wide improvement to everyone, you can't build the shared
template-catalog moat, your margins collapse into services, and every new client variation
(and there will be many) is a new fork with unbounded cost.

**The decisive argument is your own instinct: "I'm sure there are more variations."** Exactly.
- **Tailor-per-client:** every new variation = a new fork = *unbounded* cost. You lose.
- **Modular platform:** every new variation = a new *combination* of existing modules (+ maybe
  one new module that then helps everyone) = *bounded* cost. You win.

Modularity is the *only* structure that survives variation. That settles it.

---

## The founding principle, extended

Your engine already rests on: *"partners become data/config, not code."* We now extend the
same rule to the **whole product**:

> **Per-client work is CONFIGURATION and DATA — enabled modules, connector configs, partner
> maps, business rules, entitlements. Never per-client CODE.**

Same discipline, one altitude up. If serving a new client requires new code, that code must be
a **reusable module or config option**, not a client-specific branch (see "When bespoke is OK").

---

## The platform as toggleable modules

Everything in the target architecture packages into capability modules that a tenant can have
switched on or off:

| Module | What it is | Rung |
|---|---|---|
| **CORE** | Translation engine + canonical + partner maps + envelope/interchange | 0 |
| **ONBOARD** | AI onboarding (draft maps) + sandbox/certification | 0 |
| **CONNECT** | Connector layer + SDK; each connector (Shopify, Amazon, NetSuite, SAP, QuickBooks, generic REST, flat-file) is an individual toggle | cross-cutting |
| **COMPLY** | Pre-transmit business validation + chargeback/compliance monitoring | 1 |
| **INV** | Inventory/availability orchestration (fast availability truth → channels) | 2 |
| **VIS** | Observability / **control-tower dashboards** (see & manage flows) | 2 |
| **EXC** | Exception intelligence (AI root-cause + suggested/auto remediation) | 3 |
| **SKU** | SKU identity graph / cross-reference | 3 |
| **OMS** | OMS-lite: inventory & order *system of record* (NOT accounting/GL) | 4 |

A tenant's subscription = which modules + which connectors are entitled. **"Switch services by
client type" = entitlement-driven module activation** — which also becomes your pricing model
(the modularity IS the packaging).

---

## Your three client types = three entitlement bundles (same app)

| Module | **Type 1** — no ERP (QuickBooks/Shopify only) | **Type 2** — needs many connectors | **Type 3** — has ERP, needs our layer |
|---|---|---|---|
| CORE | ✓ | ✓ | ✓ |
| ONBOARD | ✓ | ✓ | ✓ |
| CONNECT | Shopify, QuickBooks, flat-file | NetSuite, SAP, generic API (many) | their 1 ERP connector |
| COMPLY | ✓ | ✓ | ✓ |
| INV (availability) | ✓ | ✓ (often) | ✓ ← **their key ask** |
| VIS (control tower) | ✓ ← **their "single pane"** | ✓ | ✓ |
| EXC / SKU | ✓ | ✓ | ✓ |
| OMS (system of record) | *maybe* (see below) | — | — (they have their ERP) |

- **Type 1** = the full stack *including* a place to see/manage everything, because they have no
  other system. **Type 3** = everything *except* OMS — we're a layer on top of their ERP.
  **Type 2** = CORE + heavy CONNECT. **Same codebase, different toggles.** That is the entire
  answer to your question.

---

## The Type-1 nuance that de-risks everything: "visualize & manage" ≠ "system of record"

You described Type 1 as needing "a small ERP tool to visualize everything." Split that in two —
they are very different builds:

- **Visualize & manage flows** = the **VIS control tower** (see orders/ASNs/invoices/exceptions,
  act on them). **Relatively light. Build it — everyone needs it anyway (Rung 2).**
- **Be their inventory/order system of record** = **OMS-lite**. **Heavy**, and it pulls you into
  competing with Extensiv/Sellercloud/Linnworks. **Defer; enter deliberately.**

**Most Type-1 clients are satisfied by VIS + INV + connectors — a control tower over their
Shopify/QuickBooks — without you becoming a full OMS.** So Type 1 is far cheaper to serve than
"build them a small ERP" implies. Only build true OMS-lite when a segment genuinely has *no*
usable system and the retention prize justifies it.

---

## On "Rungs 0–3 ready at launch"

Your sales instinct is right — a thin, single-rung product is hard to negotiate with, and
landing a couple of a client's partners to earn trust (then winning the rest) is exactly the
right land-and-expand motion. But "**all rungs fully built at launch**" is the scope trap that
prevents launching. Reconcile with two moves:

1. **Separate "the platform spans all rungs" (yes) from "every rung is feature-complete" (no).**
   The modular architecture lets each rung exist as a **thin-but-working** module you can *demo
   and sell*. "Sellable" needs a complete *story*, not a complete *feature set*.
2. **Launch as a VERTICAL SLICE, not horizontal layers.** Go **deep on ONE client (one type) and
   a couple of their partners, end-to-end across all rungs** — translation → compliance →
   availability → visibility for that slice. That proves the whole story convincingly, is
   actually achievable, and is exactly the "onboard a couple partners, earn trust, get the rest"
   motion you described.

**Modularity is what makes the thin-complete demo possible** — so it *serves* your "sellable at
launch" goal rather than competing with it.

---

## The coupling you should see: beachhead client type = first module build order

You don't build all modules at once, so **which client type you land first decides which modules
you must build first:**

- **Beachhead Type 3 (has ERP):** lightest build — CORE + ONBOARD + COMPLY + INV + one ERP
  connector. **No OMS.** Fastest path to proving translation + real-time + compliance. Clients
  are more demanding/fewer, but you avoid the heaviest module.
- **Beachhead Type 1 (no ERP):** most common in true-SMB dropship, highest lock-in — but forces
  VIS early and tempts you toward OMS-lite (heaviest, most competitive). Serve them with
  **VIS + INV + connectors** first; hold OMS.
- **Type 2** is really a *connector-intensity* attribute, not a standalone beachhead.

**Recommendation:** beachhead **Type 3, or "upper Type 1"** (clients who already run at least
Shopify + QuickBooks so you serve them with a **control tower, not a built OMS**). That threads
the needle — full-story demo, real-time value, no OMS on day one.

---

## When bespoke IS acceptable (the escape valve, governed)

For a whale you might build something custom (a bespoke connector, a special rule). Rule:
**build it as a reusable module/config option and harvest it back into the platform** — a custom
connector becomes a catalog connector; a custom rule becomes a config toggle. **Bespoke *code*
that only one client can ever use is forbidden.** Bespoke *config* is normal and fine.

---

## Risks to watch

- **Entitlement/config complexity.** Many toggles = combinatorial testing surface. Mitigate with
  sensible **default bundles** (the three types above become named editions) rather than exposing
  every toggle.
- **The OMS-lite pull.** Type-1 demand will constantly tempt you to build the full OMS. Resist
  until a segment truly has no system *and* the retention math justifies competing with the
  channel-ops incumbents.
- **"Complete at launch" creep.** Hold the vertical-slice line; breadth is demoable thinly,
  depth comes from design partners.
