# Industrial Console — Information Architecture (proposal)

Status: **proposal (2026-08-04).** Restructures the console from a flat feature dashboard into a
hierarchical, drill-down admin console — *functionally* like the AWS console (resource tree + breadcrumb +
scoped workspaces), not visually. This is a **feature/IA effort**, tracked here (not in the frozen
`context.md`, and not in the hardening findings-log). Nothing is built yet.

## Why

The current console is flat: global tabs (Certification, Review, Transactions, Partners, Catalog, Library).
That works for a handful of partners but doesn't scale operationally — the review **queue is global**, document
history is one undifferentiated list, and per-partner configuration is scattered across global Catalog/Library.
An operator managing dozens of partners across multiple clients needs **containment and hierarchy**: everything
about a partner lives *inside that partner's workspace*.

## The hierarchy

```
Platform (us, the operator)
└── Clients  (tenants — our customers)          ← "Clients" tab, LHS
    └── Client workspace  (one tenant)
        ├── Overview / health
        ├── Partners  (that client's trading relationships)   ← list
        │   └── Partner workspace  (one relationship)
        │       ├── Overview & Connection (envelope, transport, connectors at a glance)
        │       ├── Documents        (by doc type, paginated)   ← per-partner, segregated
        │       ├── Onboarding       (the certification board)
        │       ├── Exceptions       (the review queue — SCOPED to this partner)
        │       └── Configuration
        │           ├── Connector    (new / replace / edit)
        │           ├── Transport     (SFTP / webhook setup)
        │           └── Maps & specs  (bindings for this partner)
        ├── Resources  (client-wide connectors / transports / maps / specs library)
        └── Users & access
```

Three drill levels: **Clients → Client → Partner → resource**. Each level is a focused workspace, reached by
a breadcrumb (`Clients / Acme Corp / Ridgeline Supply / Documents / 855`) that is deep-linkable.

## Navigation model (AWS-console functional patterns)

- **Left rail is contextual, not a fixed feature list.** At the platform level it lists Clients; inside a
  client it becomes that client's nav; inside a partner it becomes the partner-scoped nav. (Like AWS swapping
  the left nav per service.)
- **Breadcrumb** across the top for the current path + fast up-navigation.
- **Resource list → resource detail with sub-tabs** (like an S3 bucket → objects/permissions/metrics).
- **Create/replace/edit actions are co-located** with the resource they affect (connector config lives in the
  partner, not a global catalog).
- **A client/scope switcher** in the top bar (like the AWS account/region selector).

## What moves where (delta from today's flat console)

| Today (global tab) | Becomes |
|---|---|
| Review queue (global) | **Partner → Exceptions** (scoped per partner) + an optional client-level roll-up |
| Transactions (one list + doc-type pills) | **Partner → Documents** (per-partner, doc-type tabs, **paginated**) + client roll-up |
| Partners (flat list) | **Client → Partners** (a level in the tree); each opens a Partner workspace |
| Catalog (connectors/transports) | **Client → Resources** (library) + **Partner → Configuration** (bindings) |
| Library (maps/specs) | **Client → Resources** + **Partner → Configuration** |
| Certification (global) | **Partner → Onboarding** |

Nothing is deleted — every current view becomes a *scoped* view inside the hierarchy. The certification board,
provisioning forms, import wizard, and map/spec editors are reused, just relocated into the partner workspace.

## Backend reality (honest gaps)

Feasible with modest additions — the data model mostly supports it already:

- **Per-partner documents — cheap.** `transaction.relationship_id` already exists. Add `relationshipId` +
  **pagination** (`limit`/`offset` or cursor, plus a total count) to `GET /documents`. Doc-type tabs reuse the
  existing `docType` filter.
- **Per-partner exceptions — cheap.** Add a `relationshipId` filter to `GET /review` (processing_event already
  carries `relationshipId`).
- **Connection overview — cheap.** Compose from existing reads (relationship envelope + transports +
  connectors); can be assembled client-side or via one aggregation endpoint.
- **The "Clients" (cross-tenant) layer — the one real new build.** Today auth is per-tenant (an API key/user
  resolves to exactly one tenant; D80/D92). A platform operator seeing *all* clients needs:
  - a new **`platform_admin`** principal (above `client_admin`) not bound to a single tenant,
  - **cross-tenant endpoints** (`GET /admin/clients`, and existing endpoints made addressable by an explicit
    `tenantId` when the principal is a platform_admin),
  - a guard extension so a platform_admin may act within a selected client while every other principal stays
    tenant-locked (the D92 isolation must hold for non-admins).
  This is additive and must not weaken existing tenant isolation.

## Phased plan (recommended order)

**Phase A — the partner workspace (highest value, low risk, current tenancy).**
Restructure the console into Client → Partner drill-down *within the current per-tenant auth* (the logged-in
client is the single "client" for now). Deliver: the resource-tree nav + breadcrumb; the Partner workspace with
Overview/Connection, **paginated per-partner Documents by doc type**, Onboarding (existing board), scoped
Exceptions, and co-located Configuration tools. Backend: add `relationshipId` + pagination to `/documents`,
`relationshipId` to `/review`. This alone realizes most of the ask for the near-term (one client, many partners).

**Phase B — the platform-admin "Clients" layer.**
Add the `platform_admin` role + cross-tenant client list/switcher + admin endpoints, turning the top of the
tree into a real multi-client operator console. Gated behind the new role; existing per-tenant users are
unaffected.

**Phase C — polish.** Global search across the tree, saved views, bulk actions, per-partner metrics/sparklines.

## Decisions

1. **Tenancy — DECIDED 2026-08-04: Phase A only; do NOT build the cross-tenant `platform_admin` layer yet.**
   The console stays **per-tenant** (the logged-in client is the single client). The hierarchy is
   **Client → Partner → resource**; the top-level "Clients" cross-tenant list (Phase B) is deferred until
   there is more than one client tenant to manage. No new auth role, no cross-tenant endpoints in this effort —
   existing D80/D92 tenant isolation is untouched.
2. **Relation to hardening (open):** this restructure pauses the just-opened hardening phase and relocates
   views. Recommendation: land **Phase A** as a bounded feature effort, then resume hardening on the settled
   structure (so we don't harden views we're about to move).

## Phase A scope (locked)

The console's root becomes the **current client's workspace** (no Clients tab). Deliver:
- Contextual left rail + breadcrumb (Client → Partner → tab), replacing the flat global nav.
- **Partners** as the client-level landing list (reuse existing relationships data).
- **Partner workspace**: Overview & Connection · Documents (doc-type tabs, **paginated**) · Onboarding
  (existing board) · Exceptions (**scoped review queue**) · Configuration (Connector / Transport / Maps,
  reusing the existing forms/wizard/editors).
- Backend (additive, tenant-scoped, testable): `relationshipId` + pagination (`limit`/`offset` + total) on
  `GET /documents`; `relationshipId` filter on `GET /review`. No schema change (relationship_id already on
  `transaction` / `processing_event`).
