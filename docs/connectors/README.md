# Connector specs

One markdown file per connector, capturing its micro-details end-to-end: role, directions, data mapping,
transport, auth, edge cases, test strategy, phased build plan, and honest build status. We build one
connector fully (spec → code → tests → live cert) before starting the next, and record it here so the
detail is accurate and reusable.

Pattern for each connector doc: **Overview · Directions & flows · Architecture (transport vs mapping) ·
Field mapping · SKU / reference handling · Edge cases · Auth · Test strategy · Phased plan · Status.**

| Connector | Doc | Status |
|---|---|---|
| Shopify | [`shopify.md`](shopify.md) | spec (in build — A: SKU engine, then B: translation) |
| Amazon (SP-API) | — | not started |
| QuickBooks | — | not started |
| Generic REST | — | not started |
| Flat-file (CSV) / xlsx | — | shipped (baseline; see connector-layer.md) |

Cross-refs: `docs/design/connector-layer.md` (the connector SDK + ObjectMapper), `docs/context.md` (D96,
D97 …), `docs/dev-run.md` (run locally).
