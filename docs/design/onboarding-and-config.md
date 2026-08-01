# Onboarding & Configuration Model

> How a client + a trading partner get configured, where the "format authority" decision lives,
> and how the old `kon_x12settings` fat table maps to the new normalized config. Companion to
> `architecture-overview.md` §8 (DB schema) and context.md D48 (format authority). 2026-08-01.

---

## The one big change from `kon_x12settings`

Your old engine had **one fat table** per (client, supplier) that mixed three very different things:
envelope identity, transport, **and per-partner body quirks** (`is_td5`, `is_ctt`, `inc_vadd`,
`is_sac_decimal`, `po_type`…). The new model **splits those three concerns apart**, and — critically —
**the body-quirk flags disappear from config entirely: they become map data.**

```
kon_x12settings (one fat row)                     →  normalized config + maps
──────────────────────────────                       ─────────────────────────
client_id                                         →  trading_relationship.tenant_id
supplier_id                                       →  trading_relationship.partner_id
authorization_*, security_*, ergode_*, supplier_* →  envelope_config      (ISA/GS identity)
control_id, control_ver, control_gsnum, prefix    →  envelope_config
mode (P/T)                                         →  trading_relationship.mode
ftp_host/user/pwd/port, folder_in/out(_test)       →  connection          (creds → vault)
shipping_list, notification_list, ship_*, ltl_*    →  relationship settings / reference data
is_td5, inc_td5, inc_td505, is_ctt, is_shiplist,   →  ✱ THE MAP ✱ (data, not columns)
  is_sac_decimal, po_type, inc_vadd, vaddress
```

So: **envelope + transport survive as normalized tables; the boolean flags dissolve into the
declarative map.** That's the productization thesis made concrete at the config level — e.g.
`is_sac_decimal` becomes `decimal: 2` on the SAC element; `inc_vadd` becomes a `when`/segment in the
map; `is_ctt` becomes whether the map has a CTT segment; `po_type` becomes a `const`/`path`.

---

## The config tables (the "vendor setup" master config)

The spiritual successor to a `kon_x12settings` row is **`trading_relationship`** — one row per
(tenant ↔ partner), plus a few satellites:

| Table | Holds | Old source |
|---|---|---|
| **tenant** | the client org | `client` |
| **trading_partner** | a partner (vendor / retailer / marketplace) the tenant trades with | `supplier` concept |
| **trading_relationship** | tenant ↔ partner core config: **`format_authority`**, `tenant_role` (buyer/supplier), default `version`, `mode` (test/prod), `active`, governing `spec_id` | `kon_x12settings` row (the spine) |
| **relationship_document** | per (relationship, docType, direction): enabled, `map_id`, optional per-doc `format_authority`/`spec` override | (was implicit in flags) |
| **envelope_config** | ISA/GS identity: sender/receiver qualifiers+ids, control standards/version, GS version, component sep | `kon_x12settings` envelope fields |
| **connection** | transport: SFTP/API/AS2 host/folders/config; **credentials → secrets vault** | `kon_x12settings` ftp + folder fields |
| **edi_map** | the declarative map per (relationship, docType, direction, version); status; version_no | replaces the parsers + flags |
| **spec / ig** | the governing format spec (reference data: segments/elements/codes/cardinality); `owner` = client\|partner | (new — Layer-2) |

> Maps: in the prototype they were JSON files in git (D5). In the product they live in the
> **`edi_map` registry table** (per-tenant, versioned, editable, promotable) — because SaaS
> onboarding writes them per client. The engine interprets them identically either way.

---

## Where "which way" lives — `format_authority`

The "client-authoritative vs partner-authoritative" decision (D48) is a field on
**`trading_relationship`** (`format_authority`), optionally overridable per document
(`relationship_document`). It is **not an arbitrary choice — it's dictated by the trading reality:**

- The client received an **EDI mandate** from a big partner (must send in *their* required format)
  → **`partner`** (partner-authoritative). Typically the sell-side.
- The client is onboarding **their own vendors** to a format the client dictates
  → **`client`** (client-authoritative). Typically the buy-side. *(Your old model.)*

The onboarding operator answers one question per relationship: **"Whose spec governs — ours or
theirs?"** That single flag then drives everything downstream:

| `format_authority` | Governing spec | Outbound to partner | Inbound from partner |
|---|---|---|---|
| **client** | our **house spec** (we own it) | emit in our house format | validate against our spec — **partner** at fault on failure (reject/report), optionally publish them an IG |
| **partner** | the partner's **IG** (imported) | validate against their IG **before sending** — **we** at fault (avoid chargeback) | parse per their IG |

The reseller-in-the-middle typically has **both**: `client`-authoritative relationships with its
small vendors *and* `partner`-authoritative relationships with big retailers.

---

## Onboarding flow (what an operator configures, in order)

1. **Partner** — create/select the `trading_partner` (who; vendor or retailer).
2. **Relationship** — set `format_authority`, `tenant_role`, `version`, `mode`; which doc types +
   directions are in scope.
3. **Envelope** — ISA/GS identity (sender/receiver qualifiers + ids, control numbers seed) → `envelope_config`.
4. **Connection** — how documents move (SFTP/API/AS2) + credentials → `connection` (secrets to vault).
5. **Spec** — attach the governing spec: our **house spec** (client-authoritative) or **import the
   partner's IG** (partner-authoritative) → `spec` registry.
6. **Maps** — per doc/direction, the `edi_map` that translates canonical ↔ the governing format.
   In Phase 3 the **AI onboarding agent drafts these** from the spec/IG + samples; the sandbox
   validates them; a human promotes them.

Steps 1–4 are the normalized `kon_x12settings`; steps 5–6 are the new spec/IG + map layer that
replaces the boolean flags.

---

## Why this ordering matters for the build

The **spec/IG registry** (what we're about to build) is step 5 — and `format_authority` (step 2)
decides whether a spec is *authored by us* (house) or *imported from the partner*. So the registry
must model a spec with an `owner`, and the relationship must carry `format_authority`. Everything
else (envelope, connection) is a normalized lift of `kon_x12settings` and can come as we wire real
transport in Phase 2.
