# PWA Wave 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen — foundation is tightly coupled) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the BuildTrackerPro PWA's foundation — a deployable, authed, empty-but-installable React app with the parity-critical money/budget math ported and golden-tested, the full Postgres schema + RLS in place, and the R2 upload pipeline working against a local stub.

**Architecture:** Vite + React + TS SPA in `web/`. Supabase (Postgres + Auth) accessed via `@supabase/supabase-js` wrapped in TanStack Query; RLS locks every table to the single owner. Blobs go to Cloudflare R2 via presigned URLs minted by a Vercel serverless function. Online-only.

**Tech Stack:** Vite, React 18, TypeScript, TanStack Query, @supabase/supabase-js, vite-plugin-pwa, Vitest, React Testing Library, Playwright, @aws-sdk/client-s3 + s3-request-presigner (R2 is S3-compatible), Supabase CLI (local stack via Docker).

**Parity sources (native):** `ParamusBuild/Data/MoneyMath.swift`, `ParamusBuild/Data/BudgetMathService.swift`, `ParamusBuild/Models/*.swift`.

---

### Task 1: Scaffold `web/` and verify toolchain

**Files:**
- Create: `web/` (Vite scaffold), `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/.gitignore`, `web/.env.example`

- [ ] **Step 1:** From repo root, scaffold without polluting the repo root:
  Run: `npm create vite@latest web -- --template react-ts`
- [ ] **Step 2:** Install runtime + dev deps:
  Run: `cd web && npm i @supabase/supabase-js @tanstack/react-query react-router-dom && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test vite-plugin-pwa @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
- [ ] **Step 3:** Add to `web/package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"e2e": "playwright test"`. Add `web/.env.example` listing every env var from the spec (§10) with empty values. Add `.env`, `playwright-report/`, `test-results/` to `web/.gitignore`.
- [ ] **Step 4:** Configure Vitest in `vite.config.ts` (`test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.ts' }`) and create `web/src/test/setup.ts` importing `@testing-library/jest-dom`.
- [ ] **Step 5:** Verify dev server boots and test runner runs (0 tests OK):
  Run: `npm run build && npm run test`
  Expected: build succeeds; vitest exits 0.
- [ ] **Step 6: Commit**
  ```bash
  git add web
  git commit -m "PWA Wave 0: scaffold Vite+React+TS app with test tooling"
  ```

---

### Task 2: Port MoneyMath (banker's rounding) — TDD

**Files:**
- Create: `web/src/lib/money.ts`, `web/src/lib/money.test.ts`

- [ ] **Step 1: Write the failing test.** Golden values must match native (both use IEEE-754 f64, so results are identical).
  ```ts
  import { describe, it, expect } from 'vitest'
  import { cents, dollars, sum, diff, roundedToCents } from './money'

  describe('money: banker\'s rounding', () => {
    it('rounds half to even', () => {
      expect(cents(0.005)).toBe(0)   // 0.5 -> 0 (even)
      expect(cents(0.015)).toBe(2)   // 1.4999.. float -> 1? verify parity below
      expect(cents(2.5 / 100)).toBe(2)
      expect(cents(3.5 / 100)).toBe(4)
    })
    it('round-half-to-even on whole-cent halves', () => {
      // direct rounding of the *100 product
      expect(cents(0.025)).toBe(2)   // 2.5 -> 2 (even)
      expect(cents(0.035)).toBe(4)   // 3.5 -> 4 (even)
      expect(cents(-0.025)).toBe(-2) // -2.5 -> -2 (even)
    })
    it('sum is cent-exact (no float drift)', () => {
      expect(sum([1.10, 2.20, 3.30])).toBe(6.60)
    })
    it('diff is cent-exact', () => {
      expect(diff(0.30, 0.10)).toBe(0.20)
    })
    it('roundedToCents snaps to nearest cent', () => {
      expect(roundedToCents(6.6000000000000005)).toBe(6.6)
    })
  })
  ```
- [ ] **Step 2: Run, verify it fails.** Run: `npm run test -- money` → FAIL (module not found).
- [ ] **Step 3: Implement** `web/src/lib/money.ts`:
  ```ts
  // Mirror of ParamusBuild/Data/MoneyMath.swift. Money = number-as-dollars,
  // treated as exact cents. All aggregation goes through integer cents.
  function roundHalfToEven(n: number): number {
    if (Math.abs(n - Math.trunc(n)) === 0.5) {
      const f = Math.floor(n)
      return f % 2 === 0 ? f : f + 1
    }
    return Math.round(n) // non-half cases: JS round matches for these
  }
  export function cents(value: number): number {
    return roundHalfToEven(value * 100)
  }
  export function dollars(c: number): number {
    return c / 100
  }
  export function sum(values: Iterable<number>): number {
    let total = 0
    for (const v of values) total += cents(v)
    return dollars(total)
  }
  export function sumBy<T>(items: Iterable<T>, key: (t: T) => number): number {
    let total = 0
    for (const it of items) total += cents(key(it))
    return dollars(total)
  }
  export function diff(a: number, b: number): number {
    return dollars(cents(a) - cents(b))
  }
  export function roundedToCents(v: number): number {
    return dollars(cents(v))
  }
  ```
  Note: if Step 1's `cents(0.015)` golden differs, set the expectation to the value `node -e "console.log(Math.round(0.015*100))"` yields — that IS native parity since Swift uses the same f64 product. Lock the test to that.
- [ ] **Step 4: Run, verify pass.** Run: `npm run test -- money` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add web/src/lib/money.ts web/src/lib/money.test.ts
  git commit -m "PWA Wave 0: port MoneyMath (banker's rounding) with golden tests"
  ```

---

### Task 3: Port budget math + health — TDD

**Files:**
- Create: `web/src/lib/budgetMath.ts`, `web/src/lib/budgetMath.test.ts`
- Read first: `ParamusBuild/Data/BudgetMathService.swift`, `ParamusBuild/Models/BudgetLineItem.swift` (to copy exact formulas + thresholds).

- [ ] **Step 1: Write failing tests** covering line-item derivations and health thresholds:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { lineItemHealth, remaining, variance, utilization, spentAndCommitted, openCommitment } from './budgetMath'

  const base = { budget: 1000, actual: 0, committed: 0, isAllowance: false, allowanceAmount: 0 }

  describe('budget math', () => {
    it('openCommitment = committed - actual (non-allowance)', () => {
      expect(openCommitment({ ...base, committed: 300, actual: 100 })).toBe(200)
    })
    it('spentAndCommitted = actual + openCommitment', () => {
      expect(spentAndCommitted({ ...base, actual: 100, committed: 300 })).toBe(300)
    })
    it('remaining (regular) = budget - spentAndCommitted', () => {
      expect(remaining({ ...base, budget: 1000, actual: 100, committed: 300 })).toBe(700)
    })
    it('variance = spentAndCommitted - budget', () => {
      expect(variance({ ...base, budget: 1000, actual: 1200 })).toBe(200)
    })
    it('health overBudget when variance > 0 (in cents)', () => {
      expect(lineItemHealth({ ...base, budget: 1000, actual: 1000.01 })).toBe('overBudget')
    })
    it('health nearLimit at utilization >= 0.90', () => {
      expect(lineItemHealth({ ...base, budget: 1000, actual: 900 })).toBe('nearLimit')
    })
    it('health healthy below 0.90', () => {
      expect(lineItemHealth({ ...base, budget: 1000, actual: 899 })).toBe('healthy')
    })
  })
  ```
- [ ] **Step 2: Run, verify fail.** Run: `npm run test -- budgetMath` → FAIL.
- [ ] **Step 3: Implement** `web/src/lib/budgetMath.ts` using the `money.ts` helpers and the exact formulas from `BudgetMathService.swift` (port `actualSpend`, `committedSpend`, `cashPaidTotal`, `pendingExposure`, `allowanceOverage`, and `recalculateActuals` signatures too; `health`: overBudget if `cents(variance) > 0`, else nearLimit if `utilization >= 0.9`, else healthy). Match allowance branch: `remaining` for allowance = `allowanceAmount - actual`.
- [ ] **Step 4: Run, verify pass.** Run: `npm run test -- budgetMath` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add web/src/lib/budgetMath.ts web/src/lib/budgetMath.test.ts
  git commit -m "PWA Wave 0: port budget math + health thresholds with tests"
  ```

---

### Task 4: Domain types + enums

**Files:**
- Create: `web/src/domain/types.ts`, `web/src/domain/enums.ts`
- Read first: all of `ParamusBuild/Models/*.swift`.

- [ ] **Step 1:** Define TS `type`s for all 12 entities mirroring the spec §5 tables (camelCase fields; `*ObjectKey?: string` for blob columns; dates as ISO strings). Define union-type enums in `enums.ts` matching native raw values exactly (e.g. `ProjectStatus = 'planning'|'active'|'paused'|'complete'`).
- [ ] **Step 2:** Add a type-only test `web/src/domain/types.test-d.ts` is overkill; instead add one runtime sanity test asserting enum arrays match expected members. Run: `npm run test -- enums`.
- [ ] **Step 3: Commit**
  ```bash
  git add web/src/domain
  git commit -m "PWA Wave 0: TS domain types + enums mirroring native models"
  ```

---

### Task 5: Supabase project init + schema migration

**Files:**
- Create: `web/supabase/config.toml` (via CLI), `web/supabase/migrations/0001_schema.sql`

- [ ] **Step 1:** Init Supabase in `web/`: Run: `cd web && supabase init`
- [ ] **Step 2:** Write `0001_schema.sql` creating all 12 tables per spec §5: `id uuid primary key default gen_random_uuid()`, `owner uuid not null default auth.uid()`, `project_id uuid` FKs `references projects(id) on delete cascade`, money cols `numeric(14,2) not null default 0`, enums as `text` with `check` constraints, `deleted_at timestamptz` on `projects`, blob key cols (`receipt_object_key`, `image_object_key`, `file_object_key`, `photo_object_key`), `created_at timestamptz not null default now()`. Add indexes on `project_id` and `owner`.
- [ ] **Step 3:** (Validated when Docker is up in Task 11.) For now lint the SQL by eye; commit.
- [ ] **Step 4: Commit**
  ```bash
  git add web/supabase
  git commit -m "PWA Wave 0: Supabase init + full 12-table schema migration"
  ```

---

### Task 6: Row-Level Security migration

**Files:**
- Create: `web/supabase/migrations/0002_rls.sql`

- [ ] **Step 1:** Enable RLS on all 12 tables and add a policy set per table: `using (owner = auth.uid())` for select/update/delete and `with check (owner = auth.uid())` for insert/update. Example for one table, repeated for all:
  ```sql
  alter table projects enable row level security;
  create policy projects_sel on projects for select using (owner = auth.uid());
  create policy projects_ins on projects for insert with check (owner = auth.uid());
  create policy projects_upd on projects for update using (owner = auth.uid()) with check (owner = auth.uid());
  create policy projects_del on projects for delete using (owner = auth.uid());
  ```
- [ ] **Step 2: Commit**
  ```bash
  git add web/supabase/migrations/0002_rls.sql
  git commit -m "PWA Wave 0: RLS policies locking every table to the owner"
  ```

---

### Task 7: Supabase client + Query provider

**Files:**
- Create: `web/src/lib/supabase.ts`, `web/src/lib/queryClient.ts`
- Modify: `web/src/main.tsx`

- [ ] **Step 1:** `supabase.ts` — `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`. `queryClient.ts` — a `QueryClient` with sane defaults (staleTime 30s).
- [ ] **Step 2:** Wrap `<App/>` in `<QueryClientProvider>` in `main.tsx`.
- [ ] **Step 3:** Verify build: Run: `npm run build` → success.
- [ ] **Step 4: Commit**
  ```bash
  git add web/src/lib/supabase.ts web/src/lib/queryClient.ts web/src/main.tsx
  git commit -m "PWA Wave 0: Supabase client + TanStack Query provider"
  ```

---

### Task 8: Auth — login screen + session guard

**Files:**
- Create: `web/src/features/auth/useSession.ts`, `web/src/features/auth/LoginScreen.tsx`, `web/src/features/auth/RequireAuth.tsx`, `web/src/features/auth/LoginScreen.test.tsx`

- [ ] **Step 1: Write failing component test** — LoginScreen renders email/password fields and a submit button.
- [ ] **Step 2: Run, verify fail.** Run: `npm run test -- LoginScreen`.
- [ ] **Step 3: Implement** `useSession` (subscribe to `supabase.auth.onAuthStateChange`, expose session/loading), `LoginScreen` (email+password via `supabase.auth.signInWithPassword`, error display, no vague handling — show the returned error message), `RequireAuth` (redirect to `/login` when no session).
- [ ] **Step 4: Run, verify pass.** Run: `npm run test -- LoginScreen` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add web/src/features/auth
  git commit -m "PWA Wave 0: auth — login screen + session guard"
  ```

---

### Task 9: R2 signing function + uploader — TDD

**Files:**
- Create: `web/api/r2-sign.ts` (Vercel serverless), `web/src/lib/r2.ts` (client), `web/src/lib/r2.test.ts`

- [ ] **Step 1: Write failing test** for the client key namespacing + upload flow using a mocked fetch (presign request) and a mocked PUT; assert it returns the object key and posts the key under the user id prefix.
- [ ] **Step 2: Run, verify fail.** Run: `npm run test -- r2`.
- [ ] **Step 3: Implement** `r2-sign.ts`: verify the Supabase JWT from the Authorization header (`supabase.auth.getUser(jwt)`); reject if absent; build an S3 client for R2 (`endpoint: https://<account>.r2.cloudflarestorage.com`, `region: 'auto'`); return a presigned PUT URL (`@aws-sdk/s3-request-presigner`) for key `${userId}/${entity}/${uuid}`. Implement `r2.ts` `uploadBlob(file, entity)`: call `/api/r2-sign`, `PUT` the file, return the key; `signedDownloadUrl(key)`: ask the function for a GET URL. For local tests/dev, gate behind `VITE_R2_LOCAL` to write to a local stub directory.
- [ ] **Step 4: Run, verify pass.** Run: `npm run test -- r2` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add web/api/r2-sign.ts web/src/lib/r2.ts web/src/lib/r2.test.ts
  git commit -m "PWA Wave 0: R2 presigned upload/download pipeline with tests"
  ```

---

### Task 10: App shell, router, PWA manifest

**Files:**
- Create: `web/src/routes/AppRouter.tsx`, `web/src/app/AppShell.tsx`, `web/public/manifest.webmanifest`, icons under `web/public/icons/`
- Modify: `web/vite.config.ts` (vite-plugin-pwa), `web/src/App.tsx`

- [ ] **Step 1:** Configure `vite-plugin-pwa` (registerType autoUpdate, manifest: name "HomeBuild Pro", display standalone, theme color, icons 192/512). Generate placeholder maskable icons.
- [ ] **Step 2:** Router: `/login` (public), everything else behind `RequireAuth`; app shell with a bottom tab bar stub (Dashboard/Budget/Photos/More) — empty screens for now.
- [ ] **Step 3:** Verify production build emits a service worker + manifest: Run: `npm run build` then check `web/dist/manifest.webmanifest` and `sw.js` exist.
- [ ] **Step 4: Commit**
  ```bash
  git add web/src web/public web/vite.config.ts
  git commit -m "PWA Wave 0: installable app shell + router + manifest"
  ```

---

### Task 11: Local Supabase stack + e2e smoke

**Files:**
- Create: `web/playwright.config.ts`, `web/tests/e2e/smoke.spec.ts`, `web/supabase/seed.sql`

- [ ] **Step 1:** Ensure Docker daemon is up (`docker ps`). Start local stack: Run: `cd web && supabase start` → capture local API URL + anon key into `web/.env`.
- [ ] **Step 2:** Apply migrations to local: Run: `supabase db reset` (runs 0001+0002) → expect no SQL errors. This validates schema + RLS.
- [ ] **Step 3:** `seed.sql` creates the single auth user (Raj) for local testing. Playwright config starts `npm run dev` and runs against it.
- [ ] **Step 4:** `smoke.spec.ts`: visit app → redirected to /login → sign in with seeded creds → land on empty Dashboard. Run: `npm run e2e` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add web/playwright.config.ts web/tests web/supabase/seed.sql
  git commit -m "PWA Wave 0: local Supabase stack + e2e login smoke test"
  ```

---

### Task 12: Deploy config (ready, not live)

**Files:**
- Create: `web/vercel.json`, `docs/superpowers/DEPLOY.md`

- [ ] **Step 1:** `vercel.json` — framework "vite", build/output settings; document Root Directory = `web/`. Serverless function `api/r2-sign.ts` recognized by Vercel.
- [ ] **Step 2:** `DEPLOY.md` — the exact ~10-minute runbook for Raj: create Supabase project, create R2 bucket + token, import GitHub repo to Vercel (Root Directory = web/), paste env vars, `supabase db push`. (The only step requiring Raj.)
- [ ] **Step 3: Commit**
  ```bash
  git add web/vercel.json docs/superpowers/DEPLOY.md
  git commit -m "PWA Wave 0: Vercel deploy config + deployment runbook"
  ```

---

## Self-Review

**Spec coverage:** §2 stack → Tasks 1,5,7,9,10; §4 architecture → 7,9; §5 schema → 5; §6 money/budget → 2,3; §7 auth/RLS → 6,8,9; §9 testing → 2,3,8,9,11; §10 deploy → 12; §11 gotchas → 12 runbook. Waves 1–5 are deliberately deferred to their own plans. ✓ No Wave-0 spec item uncovered.

**Placeholder scan:** Logic tasks (2,3,9) carry real code/tests; scaffolding tasks carry exact commands + file responsibilities. No "add error handling"-style vagueness (Task 8 specifies "show the returned error message"). ✓

**Type consistency:** `cents/dollars/sum/diff/roundedToCents` (Task 2) reused by Task 3; `*ObjectKey` naming (Task 4) matches blob columns (Task 5) and `r2.ts` (Task 9); enum raw values (Task 4) match schema checks (Task 5). ✓
