# BuildTrackerPro PWA — Design Spec

**Date:** 2026-05-28
**Author:** Raj + Claude (autopilot build)
**Status:** Approved to build (Raj waived per-section review; execute autonomously)

## 1. Goal

Build a Progressive Web App edition of BuildTrackerPro / "HomeBuild Pro" that runs **in parallel** with the existing native SwiftUI/SwiftData iOS app. Raj will use whichever proves better. The PWA must reach **full feature parity** with the native app over time, built in waves. It exists to escape the side-load re-signing treadmill and give durable, device-independent access to a 15-month construction project's data.

Non-negotiables:
- **Cent-exact money math** identical to native (or budget-health flags diverge).
- **Single user** (Raj only). No multi-user, no sharing, no conflict resolution.
- **Durable cloud storage** — the whole point is data that survives device loss/reinstall.

## 2. Stack

| Layer | Choice | Free tier |
|---|---|---|
| Framework | **Vite + React + TypeScript** SPA, installable PWA (`vite-plugin-pwa`) | n/a |
| Hosting | **Vercel** (Hobby), GitHub auto-deploy, Root Directory = `web/` | 100 GB bandwidth; non-commercial (fine — personal) |
| Database + Auth | **Supabase** (Postgres + Auth) | 500 MB DB, 50k MAU; **pauses after 7 days inactivity** |
| Blob storage | **Cloudflare R2** (photos/receipts/docs/bids) | 10 GB, zero egress |
| Server logic | **Vercel serverless function** — mints R2 signed upload/download URLs after checking the Supabase session | included |
| Server state / cache | **TanStack Query** (in-memory + brief persistence) | n/a |

**Online-only.** Raj has reliable cellular coverage at the Paramus site, so offline-first was dropped. The app stays installable with an app-shell cache, but assumes the network is available — no IndexedDB outbox, no background sync. (Revisit only if signal becomes a real problem.)

## 3. Repo layout

New `web/` subfolder in this existing repo (`github.com/rshah112/BuildTrackerPro-V2`). The native Xcode project is untouched; Vercel builds only `web/`.

```
web/
  src/
    lib/            # supabase client, money math, query client, r2 client
    domain/         # TS types mirroring the 12 entities + enums
    data/           # per-entity data hooks (TanStack Query over Supabase)
    features/       # screens: dashboard, budget, expenses, photos, ... (one folder per area)
    components/     # shared UI (CurrencyField, BudgetHealthPill, forms, empty states)
    routes/         # router + app shell
  api/              # Vercel serverless fns (R2 signed URLs)
  supabase/         # migrations (SQL) + seed + config
  tests/            # vitest unit + playwright e2e
```

## 4. Architecture

- **SPA** talks to Supabase directly via `@supabase/supabase-js` (Postgres REST + Auth) for all structured data, gated by Row-Level Security.
- **TanStack Query** wraps every read/write for caching, loading/error states, and optimistic updates.
- **Blobs never transit Postgres.** Upload flow: client asks `/api/r2-sign` (serverless fn) for a presigned PUT URL → client `PUT`s the file straight to R2 → client writes the returned **object key** into the row's `*_object_key` column. Download/display uses a presigned GET URL (or a public-read bucket with unguessable keys; presigned GET preferred for privacy).
- **Money** is computed by a TS port of `MoneyMath` + `BudgetMathService`, the single source of budget truth. UI never does ad-hoc float math on money.

## 5. Data model (12 entities → Postgres)

All tables carry `id uuid pk`, `owner uuid not null default auth.uid()` (for RLS), and `project_id uuid` where applicable. Money columns are `numeric(14,2)` in Postgres but **always passed through the cents helper** in app code before comparison/aggregation. Denormalized name snapshots from native are preserved.

| Table | Notable columns (beyond id/owner) | Blob key column |
|---|---|---|
| `projects` | name, address, status, priority, template_type, purchase_price, square_footage, lot_dimensions, proposed_build_dimensions, footprint, stories, basement, scope_summary, warranty_notes, start_date, target_finish_date, construction_budget, contingency_budget, created_at, **deleted_at** (soft delete, 30-day trash) | — |
| `budget_categories` | project_id, name, sort_order, target_budget, system_image | — |
| `budget_line_items` | project_id, cost_code, title, category_name, room_tag, budget, actual, committed, notes, is_pinned, is_allowance, allowance_amount, created_at | — |
| `expenses` | project_id, amount, amount_paid, vendor_name, invoice_number, date, due_date, expected_payment_date, paid_date, payment_method, payment_reference, category_name, room_tag, budget_line_item_id, budget_line_item_title, notes, is_paid | `receipt_object_key` |
| `vendors` | project_id, name, trade, phone, email, notes | — |
| `bid_packages` | project_id, scope_title, due_date, status, awarded_bid_id, created_at, notes | — |
| `bids` | project_id, package_id, vendor_id, vendor_name, amount, file_name, notes, line_items (jsonb), created_at, awarded_at | `file_object_key` |
| `photo_attachments` | project_id, created_at, room_tag, phase_tag, category_name, budget_line_item_id, notes | `image_object_key` |
| `project_documents` | project_id, file_name, kind, status, notes, budget_line_item_id, budget_line_item_title, uploaded_at | `file_object_key` |
| `project_tasks` | project_id, title, status, due_date, vendor_id, budget_line_item_id, photo_ids (uuid[]), notes, created_at, completed_at | — |
| `change_orders` | project_id, title, amount, status, notes, category_name, budget_line_item_id, budget_line_item_title, created_at, expected_payment_date | — |
| `allowance_selections` | project_id, line_item_id, selection_date, vendor, amount, notes | `photo_object_key` |

**Enums** (as Postgres enums or check-constrained text): project status (planning/active/paused/complete), priority (low/normal/high/urgent), budget health (healthy/nearLimit/overBudget — derived, not stored), change-order status (pending/approved/paid), bid-package status (open/awarded/passed), document kind (survey/approvals/plans/inspections/contractsInsurance/receiptsWarranties/other), document status (required/received/missing), task status (todo/inProgress/blocked/done).

**Cascade:** deleting a project cascades to all children (FK `on delete cascade`) and the app deletes the project's R2 objects. Soft delete sets `deleted_at`; a scheduled purge removes rows >30 days in trash.

## 6. Money math (parity-critical)

Port `ParamusBuild/Data/MoneyMath.swift` to `web/src/lib/money.ts`:
- `cents(value)` = `Math.round(value * 100)` using **banker's rounding** (round-half-to-even — implement explicitly; JS `Math.round` is half-up).
- `dollars(cents)`, `sum(values)`, `diff(a,b)`, `roundedToCents` — all via integer cents.

Port `BudgetMathService` to `web/src/lib/budgetMath.ts`: `spentAndCommitted`, `openCommitment`, `remaining`, `variance`, `utilization`, `health` (overBudget if variance>0 in cents; nearLimit if utilization ≥ 0.90), `actualSpend` (expenses + paid change orders + allowance selections, de-double-counting allowance expenses), `committedSpend`, `cashPaidTotal`, `pendingExposure`, `allowanceOverage`, `recalculateActuals`. **These get golden-value unit tests cross-checked against native outputs.**

## 7. Auth & security

- **Supabase Auth**, email magic-link or email+password, **single account = Raj**.
- **Row-Level Security on every table**: `owner = auth.uid()` for select/insert/update/delete. The public Vercel URL is useless without a session.
- The R2 signing function validates the caller's Supabase JWT before issuing any presigned URL, and namespaces keys under the user id.
- Secrets (Supabase service role, R2 access key/secret) live only in Vercel env vars + local `.env` (gitignored), never in client code.

## 8. Feature parity surface

Beyond CRUD on the 12 entities, native has: 11 project templates + room catalog, 10-sheet Excel workbook export, multi-project PDF insights, 14-day cash-flow forecast, backup/export ZIP, soft-delete trash, and receipt OCR (Vision).

Web equivalents:
- **Excel export** → SheetJS (`xlsx`), build the same 10 sheets.
- **PDF insights** → `pdf-lib` or `jspdf`.
- **Templates / room catalog** → port the data tables directly.
- **Cash flow** → port the forecast logic.
- **Receipt OCR** → native uses iOS Vision (unavailable on web). v1 = **manual entry**; optional later: Tesseract.js client-side OCR. Flagged as a known parity gap, not a blocker.

## 9. Testing strategy

- **Vitest unit tests** — money math, budget math, validators, data transforms. Highest fidelity, no infra. Money/budget get golden-value tests mirroring native results.
- **React Testing Library** — forms and key screens (currency input, budget health pill, expense form).
- **Playwright e2e** — core flows against the Vite dev server pointed at **local Supabase** (`supabase start`, needs Docker) seeded with fixtures; blob uploads tested against the local stack's storage / a local S3 stub.
- **What needs Raj's cloud accounts:** only the final live-environment smoke test + production deploy. Everything above runs locally. (Docker daemon must be up for the Supabase local stack; warming it up now.)

## 10. Deployment

1. Raj creates free accounts: **Supabase project**, **Cloudflare R2 bucket + API token**, **Vercel** (connect the GitHub repo).
2. Paste keys into Vercel env vars (and local `.env` for dev): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. Apply Supabase migrations (`supabase db push`).
4. Vercel deploys `web/`; add to iPhone home screen.

This is the only step requiring Raj, and it's ~10 minutes once the app is built and green locally.

## 11. Free-tier gotchas (designed around)

- **Supabase pauses after 7 days inactivity** — Raj uses it actively, but note a cron/uptime ping could keep it warm if needed.
- **Supabase 500 MB DB** — structured data is tiny; blobs are in R2, so this is comfortable.
- **R2 10 GB / zero egress** — fits a 15-month photo log; presigned GET avoids public exposure.
- **Vercel Hobby = non-commercial** — personal use, fine.
- **iOS Safari PWA** — must "Add to Home Screen" for standalone; storage can be evicted (irrelevant now that we're online-only). Use `apple-touch-icon`, proper manifest, `display: standalone`.

## 12. Milestone waves

- **Wave 0 — Foundation:** scaffold `web/` (Vite+React+TS+PWA), Supabase client, TanStack Query, router/app shell, TS domain types + enums, **money + budget math ports with unit tests**, Supabase migrations for all 12 tables + RLS, Auth (login screen + session guard), R2 signing function + upload/download client + local stub, deploy-config (not yet live). App boots, login works, money tests green.
- **Wave 1 — Core budget loop:** Projects (list/create/edit/soft-delete/trash), BudgetCategory, BudgetLineItem, Expense (incl. receipt photo → R2), Dashboard with live budget health. `recalculateActuals` wired. e2e on the core loop. **Usable app.**
- **Wave 2 — Media:** PhotoAttachment gallery (room/phase tags), ProjectDocument, Bid files, AllowanceSelection photos — full R2 pipeline + thumbnails.
- **Wave 3 — Remaining financial/ops entities:** ChangeOrder (+ math), AllowanceSelection (+ allowance math), Vendor.
- **Wave 4 — Procurement & tasks:** BidPackage, Bid (award flow, jsonb line items), ProjectTask (vendor/line-item/photo links).
- **Wave 5 — Power features:** 11 templates + room catalog, Excel workbook export (10 sheets), cash-flow forecast, PDF insights, backup/export. OCR deferred (manual entry).

Each wave: implement → unit/e2e tests green → status check-in (not a question).

## 13. Out of scope

Offline-first sync; multi-user/sharing/RBAC; native iOS Vision OCR (web manual entry instead, optional Tesseract.js later); migrating existing native data (Raj chose **start fresh**).
