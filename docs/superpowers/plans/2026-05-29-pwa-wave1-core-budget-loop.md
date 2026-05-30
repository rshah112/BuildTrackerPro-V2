# PWA Wave 1 — Core Budget Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A usable app: create a project, build its budget (categories + line items), log expenses with receipt photos, and see a live dashboard with cent-exact budget health — all persisted to Supabase under RLS.

**Architecture:** A generic snake_case↔camelCase mapping layer sits between `@supabase/supabase-js` and the domain types. Per-entity TanStack Query hooks (list/create/update/soft-delete) wrap it. The deferred multi-entity budget aggregates and expense math are ported with golden tests, then wired into a recalc-on-write flow so line-item `actual` stays correct.

**Tech Stack:** Same as Wave 0. Parity sources: `ParamusBuild/Data/BudgetMathService.swift`, `ParamusBuild/Models/Expense.swift`, `BudgetLineItem.swift`.

---

### Task 1: snake/camel case mapper (TDD)
**Files:** Create `web/src/lib/casing.ts`, `web/src/lib/casing.test.ts`
- [ ] Test: `toCamel({budget_line_item_id:1, photo_ids:[2]})` → `{budgetLineItemId:1, photoIds:[2]}`; `toSnake` is the inverse; arrays of objects map deeply; null/undefined pass through; ISO date strings untouched.
- [ ] Implement deep `toCamel`/`toSnake` (recurse objects + arrays; leave primitives). Run `npm run test -- casing`. Commit.

### Task 2: Expense math (TDD)
**Files:** Create `web/src/lib/expenseMath.ts`, `web/src/lib/expenseMath.test.ts`
- [ ] Test against native `Expense` computed props: `effectiveAmountPaid(e)` = `isPaid ? min(amount, max(0, amountPaid)) : 0`; `balanceDue(e)` = `max(0, amount - effectiveAmountPaid)`, cent-exact. Cases: unpaid→0; overpaid clamped to amount; partial.
- [ ] Implement using `lib/money` cents. Run tests. Commit.

### Task 3: Budget aggregates (TDD) — the deferred Wave-0 work
**Files:** Create `web/src/lib/budgetAggregates.ts`, `web/src/lib/budgetAggregates.test.ts`
- [ ] Port from `BudgetMathService.swift`: `actualSpend(items, expenses, allowanceSelections, changeOrders)` with allowance de-dup; `committedSpend`; `cashPaidTotal`; `pendingExposure`; `allowanceOverage`; `recalculateActuals(items, expenses, changeOrders, allowanceSelections)` returning a map of lineItemId→actual. Use `lib/money`, `expenseMath`, `budgetMath.openCommitment`.
- [ ] Tests mirror native results (golden). Run. Commit.

### Task 4: Data layer — mapped Supabase hooks
**Files:** Create `web/src/data/table.ts` (generic), `web/src/data/hooks.ts`
- [ ] `table<T>(name)` returns `{ list(projectId?), create, update, softDelete? }` calling supabase with `toCamel`/`toSnake` mapping and owner-scoped queries (RLS enforces). Generic TanStack Query hooks `useRows`, `useCreateRow`, `useUpdateRow` with query-key invalidation.
- [ ] Light unit test with a mocked supabase client (insert returns mapped row). Commit.

### Task 5: Projects feature
**Files:** `web/src/features/projects/` (ProjectsList, ProjectForm, useProjects), update router
- [ ] List active projects (deletedAt null), create/edit (name, address, status, template, budgets), soft-delete → Trash, restore. Component test for the form. Commit.

### Task 6: Budget categories + line items
**Files:** `web/src/features/budget/` (CategoryList, LineItemForm, hooks)
- [ ] CRUD categories and line items within a selected project; show per-line health pill (from `budgetMath.lineItemHealth`). Component test for health pill. Commit.

### Task 7: Expenses + receipt upload
**Files:** `web/src/features/expenses/` (ExpenseList, ExpenseForm, hooks)
- [ ] CRUD expenses; attach a receipt via `lib/r2.uploadBlob` (local stub in dev); on write, run `recalculateActuals` and persist affected line-item `actual`. Component test for the form. Commit.

### Task 8: Dashboard
**Files:** `web/src/features/dashboard/DashboardScreen.tsx` (replace stub), `web/src/features/dashboard/useDashboard.ts`
- [ ] Show project totals: budget, actual, committed, remaining, and a health roll-up using the aggregates. Component test for the summary numbers. Commit.

### Task 9: e2e — core loop
**Files:** `web/tests/e2e/budget-loop.spec.ts`
- [x] Sign in → create project → add category + line item → add expense → dashboard reflects the spend and health. Run `npm run e2e`. Commit.

## Self-Review
- Spec §5/§6 covered: aggregates+expense math (T2,T3), schema already in Wave 0; CRUD for Projects/Categories/LineItems/Expenses (T5–T7); Dashboard health (T8); mapping layer (T1,T4); e2e (T9).
- No placeholders: each task names files, parity source, and a concrete test.
- Type consistency: hooks return Wave-0 domain types; aggregates consume `LineItemMoney` + Expense/ChangeOrder/AllowanceSelection shapes from `domain/types`.
