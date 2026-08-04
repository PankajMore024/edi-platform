# Hardening Findings Log

The running ledger for the review/hardening phase (see `README.md` for the rules). One entry per finding.
This is the dedicated context — hardening narrative lives here, **not** in `docs/context.md`.

## Entry template

```
### Hn — <short title>
- **Module/file:** path:line
- **Severity:** blocker | major | minor | nit
- **Kind:** correctness | security | robustness | test-gap | doc-drift | dead-code | simplification
- **Finding:** what's wrong, concretely (inputs/state → wrong outcome).
- **Validated against:** Dn in context.md / <design doc> — is this a bug, or intended-and-documented?
- **Verdict:** CONFIRMED | PLAUSIBLE (after adversarial check)
- **Decision:** fix | won't-fix (why) | defer (to where)
- **Resolution:** commit <sha>, test <name that fails-before/passes-after>. Suite green (N tests).
```

## Conventions

- IDs are sequential: H1, H2, … Never reuse.
- A finding that turns out to be intended behavior is still logged, with Decision = won't-fix and the doc
  reference that confirms intent — so the same "bug" isn't re-investigated later.
- Doc-drift (a doc no longer matching the code) is a real finding: fix the doc, note the delta.
- Each fix commit message references the finding id (e.g. "H7: …").

## Findings

_(none yet — review begins with the first module pass)_

## Per-phase summary

| Round | Module(s) | Findings | Fixed | Deferred | Suite after |
|---|---|---|---|---|---|
| — | baseline | — | — | — | 247 green |
