# PWA Wave 5 — Power Features Implementation Plan

> Autopilot wave. Each task ends with lint + test + build green; e2e stays green. Audit after the wave.

**Goal:** Port the native power features — cash-flow forecast, Excel workbook export, PDF insights, backup/export, templates/room catalog — plus build the Photos screen. Parity sources in `ParamusBuild/Data/{CashFlowService,ProjectWorkbookService,InsightsPDFService,ProjectExportService,BackupService,ProjectTemplateService,RoomCatalog}.swift`.

**Libs:** `xlsx` (SheetJS), `jspdf` + `jspdf-autotable`. Backup is plain JSON. All client-side.

---

### Task 1: Export data loader + Cash-flow forecast
- [ ] `features/export/exportData.ts`: `loadProjectExport(projectId)` loads every entity via `table(name).list({projectId})`.
- [ ] `features/cashflow/cashFlow.ts` (+ test): port `CashFlowService` — 14-day horizon, unpaid-expense balance due (expectedPaymentDate ?? dueDate) as committed, non-paid change orders (expectedPaymentDate) as pending/committed; grouped by day, sorted. `CashFlowScreen` + dashboard "next 14 days due" tile. Commit.

### Task 2: Backup / Export (JSON)
- [ ] `features/export/backup.ts`: download a full JSON snapshot of the project; restore from a JSON file (insert rows under the current user). Commit.

### Task 3: Excel workbook
- [ ] `features/export/workbook.ts`: SheetJS workbook — Summary, Categories, Line Items, Expenses, Change Orders, Allowances, Vendors, Tasks, Bids, Cash Flow sheets. Download `.xlsx`. Commit.

### Task 4: PDF insights
- [ ] `features/export/insightsPdf.ts`: jspdf report — project header, budget summary, category table (budget/actual/variance), attention flags, cash-flow. Download PDF. Commit.

### Task 5: Export hub screen
- [ ] `features/export/ExportScreen.tsx`: `/export` route + More link — buttons for Excel, PDF, JSON backup, restore. Toasts. Commit.

### Task 6: Photos
- [ ] `features/photos/`: usePhotos hook, PhotoForm (room/phase/category tags + notes; image via `lib/r2.uploadBlob` local-stub in dev), PhotosScreen gallery grouped by room. Real screen replaces stub. (R2 prod upload needs the user's Cloudflare account — flagged manual.) Commit.

### Task 7: Templates + room catalog
- [ ] `features/projects/roomCatalog.ts`: port room lists per template type (for room-tag pickers). `templates.ts`: a few starter templates; "New project from template" seeds categories/line items. Commit.

## Self-Review
- Completes the spec's Wave 5 surface; cash-flow math is the only parity-critical port (golden-tested). Excel/PDF formats are reasonable, not byte-identical to native.
- Photos UI is complete; prod blob upload deferred to R2 setup (manual).
