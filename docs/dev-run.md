# Running the platform + console locally

The console (`console/`) is a pure frontend that proxies `/api → localhost:3000`. To click through a
real, working app you need the backend running on a **file-backed sqlite** DB with demo data seeded.
No Postgres, no Docker — Node 22+ (built-in `node:sqlite`; verified on Node 26).

## One-time / whenever you want fresh data

```bash
cd platform
npm install
npm run seed        # resets ./edi-dev.sqlite and populates demo data; prints the logins
```

The seed prints credentials, e.g.:

```
• Client admin — email  admin@demo.co          password  demo1234
• Partner (Ridgeline) — email  partner@ridgeline.co  password  demo1234
• Or API key (client_admin):  edi_…
```

Demo tenant "Demo Dropship Co." with three partners: **Ridgeline** (live — ~24 documents across doc
types + 1 held exception), **Summit** (live), **Cascade** (an in-progress onboarding session).

## Run (two terminals)

```bash
# terminal 1 — backend on :3000, against the seeded file
cd platform && npm run start:local

# terminal 2 — console on :5173 (Vite), proxies /api → :3000
cd console && npm install && npm run dev
```

Open the Vite URL, then sign in:

- **Client operator** — `admin@demo.co` / `demo1234` (or the API key). Lands on the **Partners** list →
  open **Ridgeline** to see the partner workspace: Overview, Documents (paginated, by doc type),
  Onboarding, Exceptions (the held conflict), Configuration.
- **Partner** — `partner@ridgeline.co` / `demo1234`. Scoped to Ridgeline only; sees just the
  Certification board (RBAC enforced server-side).

## Notes

- `EDI_SQLITE_FILE` selects the sqlite file for both `seed` and `start:local` (default `./edi-dev.sqlite`,
  git-ignored). Delete the file (or re-run `npm run seed`) to reset.
- Production uses Postgres via `DATABASE_URL` (falls back to the sqlite file only when that is unset).
- The seed is **dev fixtures only** — it reuses test canonical samples and is not wired into any
  production path.
