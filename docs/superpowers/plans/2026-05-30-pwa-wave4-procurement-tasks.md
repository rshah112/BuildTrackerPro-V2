# PWA Wave 4 — Procurement & Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Add the remaining ops entities — **ProjectTask**, **BidPackage**, **Bid** (with award flow) — as CRUD on the Wave 2 design system, reachable from the More hub. Mirrors `ParamusBuild/Views/More/{TasksView,BidsView}.swift`.

**Architecture:** Same per-entity pattern as Wave 3 (hook + Sheet form + screen). Tasks link to vendors and budget line items via Selects. Bids belong to a BidPackage; the package screen expands to show its bids; awarding a bid sets `package.status='awarded'` + `package.awarded_bid_id` and the bid's `awarded_at`. Bid `line_items` (jsonb) stays `[]` in this wave (per-bid breakdown UI is future). Photos on tasks deferred (Wave 2 media not built).

---

### Task 1: Project Tasks
**Files:** `src/features/tasks/` (useTasks, TaskForm, TasksScreen); route + More link
- [x] CRUD over `project_tasks`. Form (Sheet): title, status (todo/inProgress/blocked/done), due date, vendor (Select), budget line (Select), notes. Screen: SegmentedControl filter by status, rows with status badge + due date, quick "mark done" toggle. Component test. Commit.

### Task 2: Bid Packages + Bids
**Files:** `src/features/bids/` (useBidPackages, useBids, BidPackageForm, BidForm, BidsScreen); route + More link
- [x] CRUD over `bid_packages` and `bids`. BidsScreen: package cards (scope, status badge, due date, bid count + low bid), expandable to show bids (vendor, amount, awarded badge) with Add bid + Award. Award mutates package (status=awarded, awarded_bid_id) and bid (awarded_at). Package + Bid forms in Sheets. Component test for a form. Commit.

### Task 3: More hub + verify
**Files:** `src/features/more/MoreScreen.tsx`; routes
- [x] Add Tasks + Bids to the More "This project" group. Full `npm run test` + lint + build + e2e green. Deploy. Commit.

## Self-Review
- Completes the spec's Wave 4 surface; reuses Wave 2 primitives and the Wave 3 screen pattern.
- Award flow is the only new interaction; bid jsonb line items deferred (noted).
