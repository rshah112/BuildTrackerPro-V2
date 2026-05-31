# BuildTrackerPro PWA — Gap Analysis & Roadmap

Date: 2026-05-30. Native iOS app (`ParamusBuild/`) vs. web PWA (`web/`), for a
**solo user tracking one ~$1.3M custom-home build**. Status: Waves 0–5 complete + audit fixes.

## ✅ Carried over (parity)
Projects · Budget categories + line items (health/variance) · Expenses (+ receipt key) ·
Change Orders (+ math) · Allowance Selections (+ overage) · Vendors · Tasks (status + done) ·
Bid Packages + Bids (award/unaward) · Dashboard with data-viz (donut, category bars, spend trend) ·
**cent-exact money/budget math** (golden-tested) · Cash-flow 14-day forecast · Excel workbook ·
PDF insights report · JSON backup + restore (with id remapping) · Photos gallery (room/phase) ·
dark mode · installable PWA.

## Native features NOT (fully) on web

> Updated 2026-05-30 (PM): implemented on branch `enhancement-fixes`.

| # | Feature | Status | Value | Notes |
|---|---------|--------|-------|-------|
| 1 | **Project Documents** (survey/approvals/plans/permits/inspections/contracts) | ✅ **DONE** | high | `features/documents/`: required checklist, upload/classify, status filter, open/edit/delete. R2 doc uploads live. |
| 2 | **Soft-delete / Trash / undo for child entities** | ⏳ **deferred** | **high** | Needs `deleted_at` on 11 child tables (shared-prod migration) + rewire every delete + per-entity Trash UI. Biggest remaining parity item; projects already have Trash/Restore. |
| 3 | **Room Summary** (budget/spend rolled up by room) | ✅ **DONE** | medium | `features/rooms/` — budget/actual + line-item/photo counts per room tag. |
| 4 | **Receipts gallery** (all receipts in one view) | ✅ **DONE** | medium | `features/expenses/ReceiptsGalleryScreen` — grid of expense receipts, tap to open. |
| 5 | **Project Info** read-only overview + Mark Complete/Reopen | ✅ **DONE** | low–med | `features/projects/ProjectInfoScreen`. |
| 6 | **Expense "expected payment date" field** | ✅ **DONE** | low | Added to ExpenseForm. |
| 7 | **Dropdown empty-state hints** (Expense/CO/Task/Photo lookups) | ✅ **DONE** | med | Field hint when the lookup source is empty (was: "dropdowns have no values"). |
| 8 | **Project templates (11 types)** "new from template" | ⏳ deferred | low | One seeded project; low value. Room catalog already ported. |
| 9 | **Portfolio insights** (multi-project rollup + PDF) | ⏳ deferred | low | Intentional: single-project focus. |
| 10 | **Receipt OCR** | ⏳ deferred | low | Needs a dep (Tesseract.js); no native-Vision equivalent. |
| 11 | **Per-bid line-item breakdown** (jsonb) | ⏳ deferred | low | Bids store the total; itemized UI deferred. |
| 12 | **Workbook re-import** ("editable workbook sync") | ⏳ deferred | low–med | PWA exports xlsx but can't read edits back. |
| 13 | **ZIP export bundle** (timestamped, incl. media) | ⏳ deferred | low | PWA does JSON/Excel/PDF. |
| 14 | **Settings** beyond appearance | ⏳ deferred | low | PWA "More" has theme only. |

## Data safety (this app is the sole repository of the build — layered protection)
- **Soft-delete + Trash** on all child entities + projects (no accidental permanent loss). ✅
- **Undo toast** on every delete. ✅
- **Confirm dialogs** on destructive actions. ✅
- **Automatic daily off-site snapshot to R2** (full JSON, independent of Postgres) + manual "Back up to cloud now" + downloadable JSON backup/restore (now includes loans). ✅
- **Supabase managed daily backups** (free tier, 7-day retention). ✅ (managed)
- ⚠️ **RECOMMENDED (needs your action — paid):** upgrade the shared Supabase project to **Pro for Point-in-Time Recovery (PITR)** — restore to any second, the strongest single protection. ~$25/mo. The only durability lever I can't pull for you.

## Useful features missing from BOTH (net-new, not parity)

| Feature | Value | Status |
|---------|-------|--------|
| **Tap-to-call / email vendors** (`tel:` / `mailto:`) | low (quick win) | ✅ **DONE** |
| **Construction loan draw tracking** | **high** | ✅ **DONE** (per-project optional; total/rate/draws, interest-only monthly payment) |
| **Payment reminders / push notifications** | medium | ⏳ deferred |
| **Milestone / schedule timeline** | medium | ⏳ deferred |
| **Global search** (expenses, line items, vendors) | low | ⏳ deferred |

## Remaining build order (single-user)
1. **Soft-delete + Trash for child entities** (#2) — highest remaining parity item; data-safety win.
2. **Construction loan-draw tracking** (net-new, high value for a financed build).
3. Lower: workbook re-import, per-bid breakdown, ZIP export, templates, OCR, push, timeline, search.

## ⚠️ Requires YOUR manual effort (see session report)
- **Cloudflare R2** for photo/receipt/document uploads in production.
- **Refine seeded budget values** with real contract/bid numbers.
- **Set project address + start/target dates** (seeded blank).
- (Optional) custom domain.
