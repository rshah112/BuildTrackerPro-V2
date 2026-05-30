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

| # | Feature | Status | Value | Notes |
|---|---------|--------|-------|-------|
| 1 | **Project Documents** (survey/approvals/plans/permits/inspections/contracts) | table + backup exist; **no UI** | **high** | Permit & contract tracking matters on a real build. Same CRUD pattern as the other entities. |
| 2 | **Soft-delete / Trash / undo for child entities** | projects only | **high** | Deleting an expense/line item/etc. is permanent — no undo. Native had data recovery. |
| 3 | **Room Summary** (budget/spend rolled up by room) | missing | medium | Room tags already exist on line items + photos; just needs an aggregation screen. |
| 4 | **Receipts gallery** (all receipt images in one view) | missing | medium | Needs R2 (manual) first. |
| 5 | **Project templates (11 types)** "new from template" | missing | low | Low value — you have one seeded project. Room catalog already ported. |
| 6 | **Portfolio insights** (multi-project rollup + PDF) | missing | low | Intentional: app is single-project-focused for you. |
| 7 | **Receipt OCR** | missing | low | Native used iOS Vision (no web equiv). Manual entry; optional Tesseract.js later. |
| 8 | **Per-bid line-item breakdown** (jsonb) | amount only | low | Bids store the total; itemized breakdown UI deferred. |
| 9 | **Expense "expected payment date" field** in the form | minor | low | Cash flow falls back to due date, so forecasting works; the form just can't set a *distinct* expected date yet. |

## Useful features missing from BOTH (worth considering)

| Feature | Value | Why |
|---------|-------|-----|
| **Construction loan draw tracking** | **high** | A $1.3M build is usually financed in draws tied to completion %; tracking draws vs budget/spend is a real gap neither app covers. |
| **Payment reminders / push notifications** | medium | PWA push for cash-flow due dates. |
| **Tap-to-call / email vendors** (`tel:` / `mailto:`) | low (quick win) | Vendor phone/email render as plain text today. |
| **Global search** (expenses, line items, vendors) | low | Useful once data grows. |
| **Milestone / schedule timeline** | medium | Track build phases against dates. |

## Suggested next build order (single-user)
1. **Project Documents** UI (permits/contracts — high real-world value, cheap).
2. **Soft-delete + Trash for child entities** (data safety — prevents irreversible mistakes).
3. **Room Summary** screen (cheap analytics win; data already tagged).
4. Quick wins: vendor `tel:`/`mailto:` links; expense expected-payment-date field.
5. Then: loan-draw tracking, receipts gallery (after R2), templates, OCR.

## ⚠️ Requires YOUR manual effort (see session report)
- **Cloudflare R2** for photo/receipt/document uploads in production.
- **Refine seeded budget values** with real contract/bid numbers.
- **Set project address + start/target dates** (seeded blank).
- (Optional) custom domain.
