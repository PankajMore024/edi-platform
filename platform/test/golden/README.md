# Golden fixtures

Byte-for-byte expected outputs for the deterministic engine. **The regression backbone.**

## Layout

```
test/golden/<partner>/<docType>/<direction>/<version>.<ext>
  e.g.  acme/850/outbound/4010.edi
        acme/850/inbound/4010.canonical.json
```

## Rules

- Every published (partner, docType, direction, version) map has at least one golden pair
  (input fixture + expected output).
- A change that alters any fixture's output **must fail CI** — that's the point. If the change is
  intentional, regenerate and **review the diff** before committing:
  ```bash
  UPDATE_GOLDEN=1 npm test
  ```
- Fixtures are real, **scrubbed** samples — never commit live partner PII/credentials.
- Financial fields (amounts, quantities, control numbers) are the highest-signal things to assert.

See `src/testing/golden.ts` for the harness.
