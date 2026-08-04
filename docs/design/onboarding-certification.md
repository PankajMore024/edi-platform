# Onboarding & certification — durable data model

Status: **spec (approved 2026-08-03), not yet built.** Governs the certification-board
onboarding screen. Hard rule (see memory `onboarding-and-data-principles`): every event
here is persisted to a normalized table — nothing cache-only, no EDI bytes in cache, and
the full lifecycle is visible to **both** parties within their scope.

This is the **design-time / certification** model. It is distinct from the **runtime**
processing ledger (`processing_event`, `transaction*`) which tracks live documents. Onboarding
tracks the *agreement itself* reaching "certified", after which runtime takes over.

---

## 1. Object model

```
certification_session ──1:N── certification_doc ──1:N── certification_test_file ──1:N── certification_issue
        │                            │                          │
        └── certification_event      └── reference_artifact      └── raw_artifact (bytes; existing store)
        └── certification_message ───┘ (shared thread, per session and optionally per doc)
```

Reuse of what exists: file **bytes** live in the existing `raw_artifact` store (already durable,
hashed) — cert tables hold only ids + verdicts. Verdicts come from the existing
`IngestService` (X12→canonical) + `ConformanceValidator`; no new validation engine.

---

## 2. Tables

All tables lead with `tenant_id`; indexes lead with `tenant_id`. Money/quantity stay TEXT
decimal. Timestamps are UTC.

### `certification_session` — one per relationship being onboarded
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | our client |
| relationship_id | text fk | → `relationship` |
| format_authority | text | `client` \| `partner` (copied from relationship; drives who produces/validates) |
| status | text | `draft` → `in_certification` → `holding` → `certified` → `active`; `superseded` |
| spec_version | text | house-spec version pinned for this certification (client-auth) |
| created_at / certified_at | ts | |
| certified_by | text | user id who signed off |

State rule: `status` cannot advance to `certified` while **any** `certification_doc` has an
open **blocking** issue. This is the "keep the mapping on hold" gate.

### `certification_doc` — one card per doc type in the session
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| session_id | uuid fk | |
| doc_type | text | 850/855/856/810/846/997 |
| role | text | `anchor` \| `response` \| `standalone` |
| direction | text | inbound / outbound (fixed by business role, not authority) |
| produced_by | text | `client` \| `partner` — who drops test files (flips with authority) |
| validated_by | text | `client` \| `partner` — the authoritative side |
| reference_artifact_id | uuid | the gold sample (auto-emitted from the map for the authoritative side) |
| status | text | `awaiting` \| `validating` \| `passed` \| `issues` \| `warning` \| `waived` |
| blocking | bool | does an open issue here block certification (default true; cosmetic → false) |
| attempt_count | int | |
| updated_at | ts | |

### `certification_test_file` — each dropped attempt + its verdict (history)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| cert_doc_id | uuid fk | |
| raw_artifact_id | uuid | bytes in the raw store — never inline |
| uploaded_by | text | `client` \| `partner` (+ user id) |
| attempt_no | int | |
| verdict | text | `passed` \| `issues` \| `warning` |
| correlated | bool | did it correspond to the anchor (e.g. 855 echoes the 850's PO, 997 acks our GS ctrl) |
| created_at | ts | |

Attempts are append-only — the to-and-fro (v1 failed → v2 passed) is the row history.

### `certification_issue` — segment/element-grained findings (queryable, not a blob)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| test_file_id | uuid fk | |
| segment | text | e.g. `HL`, `REF*BM` |
| element | text | e.g. `HL03` (nullable) |
| kind | text | `conformance` \| `correlation` \| `ambiguity` \| `code-value` |
| severity | text | `error` \| `warning` \| `info` |
| code | text | stable rule id (for analytics/dedup) |
| message | text | human text shown on the card |
| ai_suggestion | text | AI-drafted fix (nullable) — proposal only |
| directed_to | text | `client` \| `partner` — who must act |
| status | text | `open` \| `resolved` \| `waived` |

Storing issues as rows (not JSON) is deliberate: the dashboard/analytics query them
("top 5 failing segments across partners") and the certification gate counts open blocking
ones. Consistent with the earlier normalize-not-blob decision.

### `certification_message` — the logged, bilateral thread
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| session_id | uuid fk | |
| cert_doc_id | uuid | nullable (message may be doc-scoped) |
| related_issue_id | uuid | nullable |
| author_role | text | `client` \| `partner` \| `system` |
| author_user_id | text | |
| body | text | |
| created_at / delivered_at | ts | sent **and** stored — never fire-and-forget |

### `certification_event` — append-only activity feed (replaces the board's bottom log)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| session_id | uuid fk | |
| actor | text | `client` \| `partner` \| `system` |
| verb | text | `sample_generated` \| `file_dropped` \| `validated` \| `message_sent` \| `certified` … |
| doc_type | text | nullable |
| detail | text | |
| created_at | ts | |

The console's activity feed (and the transaction/analytics screens) read these tables — the
board is never the source of truth; the DB is.

---

## 3. Partner access (RBAC) — new auth surface

Today: one tenant API key per operator. Onboarding needs **per-user, authority-scoped** access
so a partner can log in and see only its own relationship.

| table | purpose |
|---|---|
| `console_user` | id, tenant_id?, email, role (`client_admin` \| `client_ops` \| `partner`), password/SSO ref |
| `user_relationship_scope` | which relationship(s) a `partner` user may see |

Enforcement: a `partner` user's queries are filtered to their scoped `relationship_id`; they can
drop test files, view their certification board, and view **their own** transaction analytics —
but not other partners' data, and cannot `certify` (client-only). The existing `ApiKeyGuard`
grows into a session/JWT guard that resolves `req.user` + scope.

---

## 4. Prerequisite: inbound validation for the response docs

The board validates dropped **855/856/810/846/997** files. Today `IngestService` round-trips
**850** only. So before the board is real, the engine needs, per response doc type:
- an **inbound map** (X12 → canonical) and
- a **house conformance spec** to validate against,

plus the **cross-doc correlation** checks (855.BAK↔850.PO, 856↔850, 997.AK1↔our GS control).
This is genuine engine work, not a UI stub — it is the long pole of this feature.

---

## 5. Build order

1. **Tables + repositories — DONE.** All six tables (schema.ts + migrations.ts + ALL_TABLES) and
   `CertificationRepository` (session/doc/test-file+issues/message/event) with the certify GATE enforced
   in the repo (a blocking doc must be passed or waived), a per-session monotonic event `seq`, and a
   monotonic stamp for stable thread/feed ordering. Registered in DatabaseModule. `certification.types.ts`
   holds the domain types. 7 node:sqlite tests. **RBAC tables (§3) deferred to step 4.**
2. Inbound ingest + conformance for 855/856/810/846/997 (+ correlation) — DONE (see §6).
3. **Certification API — DONE.** `certification/` module: `CertificationService` orchestrates
   store→conformance→ingest→correlate→verdict→record (composing D90 repo + D88/D89 validation);
   `CertificationController` exposes sessions (open seeds a card per relationship doc with
   authority-derived roles), file drop, messages, events, waive, and certify (gate → 409). Built-in
   `HOUSE_SPECS` registry (config DocSpec overrides). Correlation runs when an inbound map + anchor
   reference are configured. 6 service integration tests + 1 HTTP e2e.
4. **RBAC / partner login — DONE.** `console_user` + `user_relationship_scope` + `user_session` tables;
   `UserRepository` (scrypt+salt passwords, sha256-hashed session tokens). `PrincipalGuard` (replaces
   ApiKeyGuard as the global guard) resolves an API key → machine `client_admin` OR a `usr_` token →
   the console_user's principal (role + scopes); sets `req.principal` + `req.tenantId`. `@Public()` login,
   `AuthController` (login/me/logout + client_admin user-provisioning & scoping). The certification
   controller enforces: partners are scoped to their relationship (list filtered; 403 outside scope) and
   cannot open/certify/waive/set-reference (client-only); they may view, drop files, message. 4 user-repo
   tests + a full RBAC e2e (partner login → scoped visibility → drop allowed → certify 403 → cross-scope 403).
5. **Board UI — DONE.** `console/` gains a real Certification view + login. `LoginGate` takes email/
   password (→ `usr_` token) or an API key; App fetches `/auth/me` for the principal and renders
   **role-aware nav** (partner → only the board; client → full console + board). The board (per session):
   authority header + progress + certify gate (client, enabled on `canCertify`); doc cards grouped
   anchor/responses/standalone, each with a **drop-to-validate** file input (partner drops responses,
   client sets the anchor reference), live verdict + conformance/correlation issues + AI suggestions +
   waive; a bilateral **message thread** composer; and the durable **activity feed**. Wired to the D91/D92
   endpoints; RBAC is enforced server-side (the UI just reflects it).
6. AI at the edges: emit reference samples; explain a failed file + propose the fix.

## 6. Progress — inbound validation (step 2): **COMPLETE** for all response docs

All five response doc types now validate end-to-end (house spec + ingest + round-trip + correlation),
each proven against a real partner wire body. Engine was already symmetric, so each doc = a house spec
+ (where it answers something) a correlation entry point. One shared `correlateLines` core.

| Doc | House spec | Correlation | Tests |
|---|---|---|---|
| 855 PO Ack | `house855` | `correlateAckToOrder` → 850 (PO, unknown-line, qty-exceeds) | `inbound-855.spec` (9) |
| 856 ASN | `house856` | `correlateShipToOrder` → 850 (HL hierarchy ingested + round-trips) | `inbound-856.spec` (4) |
| 810 Invoice | `house810` | `correlateInvoiceToOrder` → 850 + **total↔line-sum reconcile (decimal)** | `inbound-810.spec` (5) |
| 846 Inventory | `house846` | none — standalone feed | `inbound-846.spec` (4) |
| 997 Func Ack | `house997` | `correlate997ToGroup` → our GS control number | `inbound-997.spec` (4) |

New canonical type `Inventory846` + `SAMPLE_846_MAP/DOC` fixtures (846 was the only doc type without
them). Correlation kinds: `po-mismatch` \| `unknown-line` \| `qty-exceeds` \| `total-mismatch` \|
`control-mismatch`. **Known scope:** multi-order 856 ingest needs HL-level `match` rules (single-order
round-trips today); the board's per-doc validation covers the certification case.

**Long pole retired.** Next: §5 step 1 (certification tables) or step 3 (certification API) can now build
on a validation layer that actually works for every response doc.
