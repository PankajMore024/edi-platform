# Sandbox ⇄ Agentic Onboarding — one closed loop

> How the sandbox and the agentic onboarding fit together. Clarifies build-plan M4
> (sandbox) + M6 (AI onboarding): they are **not two features** — the sandbox is the
> deterministic **oracle + environment**, and the onboarding agent is an **actor that loops
> against it** until a mapping is proven. Companion to `target-architecture.md` §6/§7 and
> `mvp-build-plan.md`. 2026-07-30.

---

## 1. The core idea (the answer to "how do we tie them")

```
        ┌──────────────────────────────────────────────────────────────┐
        │  SANDBOX  (isolated environment + deterministic ORACLE)        │
        │                                                                │
   ┌───▶│  apply candidate map → run engine → validate → diff vs expected│───┐
   │    │                        → STRUCTURED conformance report          │   │
   │    └──────────────────────────────────────────────────────────────┘   │
   │                                                                        │
   │  proposes revised map                              scored, machine-    │
   │  (reads the structured report)                     readable failures   │
   │                                                                        ▼
 ┌─────────────────────────────┐                         (green? ── no ──┐
 │ ONBOARDING AGENT (actor)     │◀────────────────────────────────────────┘
 │ + deterministic algorithms   │                          │ yes
 └─────────────────────────────┘                          ▼
                                                 HUMAN approves → PUBLISHED map
                                                 (immutable, pinned to relationship)
```

- The **sandbox is the oracle** — it *runs* a candidate mapping through the deterministic
  engine, validates it (syntactic vs IG + business rules), diffs against expected output, and
  emits a **structured, machine-readable conformance report**.
- The **agent is the actor** — it authors/repairs the mapping by **reading that report and
  iterating**, exactly the agent + verifier pattern. The oracle keeps the agent honest: a
  hallucinated or wrong mapping simply fails and bounces back. **No unverified mapping can
  survive the loop.**
- The **tie is a closed feedback loop:** propose → run → score → revise → repeat until green →
  human approves promotion. That loop *is* both "the sandbox" and "the onboarding" at once.

---

## 2. Shared artifacts (what makes them one system)

| Artifact | Produced by | Consumed by |
|---|---|---|
| **Test case** = (uploaded sample doc, docType, direction, expected canonical/output) | Human upload (dashboard) *or* agent-generated | Sandbox run |
| **Mapping candidate** = draft map in the DSL (versioned) | Agent (or human) | Sandbox run |
| **Sandbox run + report** = result + scored, structured diff | Sandbox oracle | Agent (to revise), Human (to approve) |
| **Golden files** = accumulated passing test cases | The loop, over time | Regression suite (every future change) |
| **Published map** = approved, immutable, pinned | Human approval gate | Production engine |

The agent's **contract with the sandbox is the report schema** — a structured failure list
(which segment/element/loop failed, expected vs got, rule violated), *not* free text. Nail
that schema and the two are cleanly decoupled yet tightly coupled.

---

## 3. Solving BOTH ends with one sandbox (your "we map them / they map us")

**Canonical is always the pivot,** so both directions are the same oracle with different
remediation:

| Case | Who adapts | What the sandbox checks | Remediation path |
|---|---|---|---|
| **We map their format** (sell-side mandate: they're the powerful party) | us | their doc ⇄ **canonical** via our candidate map | Agent **fixes OUR map**, loops to green |
| **They map our format** (our customer is the powerful party) | them | their uploaded doc vs **our published spec** (derived from canonical + reference map) | Agent emits a **plain-language conformance report + guidance** for THEM to fix; we don't change our map |

Same primitive both times: **upload a doc → run it against the target mapping/spec → produce a
scored, actionable report.** The only difference is *who consumes the report and where the fix
lands* (our map vs their system). That's why one sandbox solves both ends — and why the agent
serves both: authoring our maps in Case A, and generating/maintaining the published spec +
partner-facing guidance in Case B.

The document **direction** (inbound partner→us, outbound us→partner) is a third, orthogonal
axis — handled by the same run primitive because the engine already does all four translation
primitives (Ingest/Emit × EDI/data).

---

## 4. "Algorithm-paired AI agents" — the deterministic-first split (your instinct, made concrete)

Not everything needs an LLM. Do the mechanical 80% with algorithms; reserve the agent for the
ambiguous/semantic 20%. This keeps it cheap, fast, and reliable.

| Task | Deterministic algorithm | AI agent |
|---|---|---|
| Structural parse of X12 (segments/elements/positions) | ✅ (X12 is regular) | — |
| Schema/IG validation, cardinality, code-list checks | ✅ | — |
| Diff candidate output vs expected | ✅ | — |
| Field-name / candidate-mapping suggestions | ✅ fuzzy match / string similarity first | agent when names don't match semantically |
| Interpreting a prose IG (PDF), silent/ambiguous specs | — | ✅ (semantic) |
| Inferring intent behind idiosyncratic qualifier usage | — | ✅ |
| Explaining a failure in plain language + proposing a fix | — | ✅ |
| Generating representative test data | heuristics first | ✅ for edge cases |

Pipeline: **algorithms propose + score → agent resolves what's left ambiguous → sandbox oracle
verifies everything.** "Algorithm-paired agents" = right, and it's a cost/latency/reliability
win, not just a preference.

---

## 5. Minimum HITL — the exact gates (everything else automated)

Humans enter at **only** these points:

1. **Promotion approval** (always) — a human signs off before a map goes to prod. Trust + audit.
2. **Low-confidence / stuck escalation** — the agent can't reach green within max-iterations, or
   confidence is below threshold → hand to a human with the sandbox report attached.
3. **Ambiguity resolution** — the IG is silent/contradictory and the agent must guess → surface
   **one targeted question**, not "review the whole thing."

Everything else — parsing, drafting, testing, iterating, reporting — runs unattended.

---

## 6. The sandbox is dual-purpose (one surface, two consumers)

- **Human-facing:** a dashboard to **upload each doc type** and see conformance — the classic
  EDI certification/testing workflow partners expect during onboarding. (Your original mental
  model.)
- **Agent-facing:** the same oracle, called in a loop, is the agent's convergence harness.

Both consume the identical run+report primitive. Build the oracle once; expose it to a UI and to
the agent.

---

## 7. Mapping to the build plan

- **M4 = the sandbox-as-oracle substrate** — the environment, deterministic execution, validation,
  diff, the **structured report schema**, golden-file capture, and the upload dashboard. **This is
  the prerequisite** the agent targets. *Build the report schema carefully — it's the agent's API.*
- **M6 = the onboarding agent** — the actor that loops against M4, plus the deterministic
  pre-processing algorithms (§4). Depends entirely on M4 existing.
- **Implication:** M4 is not "thin manual sandbox, AI later." M4 must ship the **structured oracle**
  (not just a human diff view) so M6 can plug straight in. Adjust M4's definition accordingly.

---

## Open questions

- **SQ1.** Report schema design — the single most important interface here. What's the minimal
  structured failure vocabulary the agent needs to reliably self-correct?
- **SQ2.** Confidence metric — how does the agent (and the algorithms) score confidence to decide
  escalate-vs-continue?
- **SQ3.** Case B ("they map ours") — do we publish a human-readable IG, a machine-checkable spec,
  or both? How much partner-facing guidance does the agent generate vs a static guide?
- **SQ4.** Max-iteration / cost budget per onboarding run before HITL escalation.
