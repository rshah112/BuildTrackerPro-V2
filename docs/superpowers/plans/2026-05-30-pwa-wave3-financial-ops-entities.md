# PWA Wave 3 — Financial/Ops Entities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the three remaining financial/ops entities — **Vendor**, **ChangeOrder**, **AllowanceSelection** — with full CRUD on the Wave 2 design system, reachable from a restructured **More** hub, and correctly wired into budget math so the dashboard and line-item actuals stay accurate.

**Key insight:** the *math* is already ported. `budgetAggregates` (Wave 1) already counts approved change orders in `committedSpend`, paid change orders + allowance selections in `actualSpend`, pending exposure in `pendingExposure`, and `allowanceOverage`; `recalculateActuals` already folds paid COs and allowance selections into line-item actuals. So the Dashboard reflects these entities the moment their rows exist. The only new wiring is: **on CO/allowance writes, also re-run `recalculateActuals`** so the persisted `budget_line_items.actual` (shown on the Budget screen) doesn't go stale.

**Architecture:** One feature folder per entity under `src/features/`, each mirroring the Projects/Expenses pattern: a `useX` hook file over the generic data layer, a `XForm` (Sheet) on Field/Select/CurrencyField/Button, and a `XScreen` (ScreenHeader + list + EmptyState). A shared `useSyncActuals(projectId)` hook centralizes the recalc-on-write (extracted from ExpenseList) so Expenses, ChangeOrders, and AllowanceSelections all use it. New routes under `/vendors`, `/change-orders`, `/allowances`, linked from a rebuilt `MoreScreen` hub.

**Tech Stack:** Same as Wave 2. Parity sources: `ParamusBuild/Views/More/{VendorsView,ChangeOrdersView}.swift`, `Models/{Vendor,ChangeOrder,AllowanceSelection}.swift`.

**Guardrails:** Each task ends with `npm run test` + lint + build green; existing budget-loop e2e stays green.

---

### Task 1: Shared recalc hook
**Files:** Create `src/features/budget/useSyncActuals.ts`; refactor `ExpenseList.tsx` to use it
- [x] `useSyncActuals(projectId)` returns `(nextExpenses?, nextChangeOrders?, nextAllowances?) => Promise<void>` that reads current rows (defaulting to cache), runs `actualPatchesForExpenses`, and persists changed line-item actuals. ExpenseList delegates to it (no behavior change; e2e stays green). Commit.

### Task 2: Vendors
**Files:** `src/features/vendors/` (useVendors, VendorForm, VendorsScreen); route + More link
- [x] `useVendors(projectId)` (list/create/update/remove over `vendors`). `VendorForm` in a Sheet: name (required), trade, phone, email, notes. `VendorsScreen`: ScreenHeader, list rows (name + trade + contact), EmptyState, delete with toast. Route `/vendors` (RequireProject). Component test for the form. Commit.

### Task 3: Change Orders
**Files:** `src/features/changeOrders/` (useChangeOrders, ChangeOrderForm, ChangeOrdersScreen); route + More link
- [x] CRUD over `change_orders`. Form: title (required), amount (CurrencyField), status (pending/approved/paid Select), budget-line Select (sets categoryName/title), expected payment date, notes. On create/update/delete, call `useSyncActuals` so paid COs update line-item actuals. Screen: status-filtered list (SegmentedControl), status badge, amount; summary tiles (pending/approved/paid totals). Component test. Commit.

### Task 4: Allowance Selections
**Files:** `src/features/allowances/` (useAllowances, AllowanceForm, AllowancesScreen); route + More link
- [x] CRUD over `allowance_selections`. Form: line item (Select of allowance line items), amount (CurrencyField), vendor, selection date, notes. On write, `useSyncActuals`. Screen: list grouped/labeled by line item, amount; show `allowanceOverage` summary. Component test. Commit.

### Task 5: More hub + dashboard surfacing
**Files:** rewrite `src/features/more/MoreScreen.tsx`; small Dashboard addition
- [x] More becomes a grouped hub linking Vendors / Change Orders / Allowances (with icons) alongside Projects, Appearance, Install, Sign out. Dashboard: add a small "Change orders" line to the Attention/summary if any are pending/approved. Commit.

### Task 6: e2e + verify
**Files:** extend `tests/e2e/` (a change-order flow)
- [x] e2e: add a change order to the seeded project → it appears; (optional) a paid CO bumps committed/actual on the dashboard. Full `npm run test` + `npm run e2e` + build green. Deploy. Commit.

## Self-Review
- Closes the spec's Wave 3 surface (ChangeOrder/AllowanceSelection/Vendor) reusing the Wave 2 primitives; no new math (already in budgetAggregates), only recalc-on-write wiring via the shared hook.
- Each entity is independently shippable; More hub makes them reachable; dashboard already aggregates them.
- Tests: form component tests per entity + a change-order e2e; budget-loop e2e protects the existing flow.
