# Changelog

## Unreleased

- Enabled iCloud Drive entitlement (container `iCloud.com.raj.HomeBuildPro`) so backups written by `BackupService` are mirrored outside the app sandbox and survive uninstall + re-signing automatically. Wired via `ParamusBuild/Support/ParamusBuild.entitlements` and `CODE_SIGN_ENTITLEMENTS` in both Debug and Release. **Action needed before this works:** add the iCloud capability for this App ID in the Apple Developer portal (one-time, per-account).
- Added `MoneyMath` helpers and routed every meaningful currency aggregation through integer-cent math (`MoneyMath.sum`, `Double.roundedToCents`, `MoneyMath.diff`). Eliminates IEEE 754 drift on totals, variance comparisons, budget-health thresholds, and cash-flow rollups across `BudgetMathService`, `CashFlowService`, `InsightsMath`, `DashboardViewModel`, `BudgetLineItem`, `Expense`, and every user-facing summation tile (Portfolio totals, Expenses tiles, Room/Phase summaries, change-order totals, project-form allocation check).
- Added rotating ZIP backups (`BackupService`) written to `Documents/Backups/` on every launch + project change. When iCloud Drive is signed in, snapshots are also mirrored to the iCloud ubiquity container so they survive uninstall and device loss. Newest 30 snapshots are kept.
- Replaced production `fatalError` on SwiftData container failure with a `DataRecoveryView` flow: lists available backups, reveals Backups + media folders in Files.app, offers a safe "delete corrupted DB" reset that leaves backups and media intact.
- Added `DataSafetyView` reachable from a shield toolbar button on the Portfolio: backup status, "Back up now", reveal in Files, plus Trash management.
- Project deletion is now a 30-day Trash with restore. Cascading hard-delete lives on `Project.permanentlyDelete(in:)`; auto-purge runs on launch.
- `MediaStorageService` photo / receipt / document writes now throw a typed `MediaStorageError` (including `.outOfSpace`). Callers route failures through `StorageHealthMonitor` which surfaces a banner indicator on the Portfolio toolbar.
- Backups folder includes a `README.txt` explaining the on-disk layout and how to manually restore via Files.app + existing Import flow.

## v2.0 - 2026-05-08

- Added cash-flow forecasting, allowance tracking, punch-list tasks, per-room views, bid comparison, and cross-project insights.
- Tightened the dashboard so quick actions, budget progress, and cash flow stay prioritized at the top.
- Moved secondary row actions into long-press context menus and removed immediate swipe-delete patterns.
- Wired dashboard attention rows to the relevant work screens for change orders and tasks.
- Added portfolio-level insights export and workbook support for project square footage.
- Verified with `xcodebuild -scheme ParamusBuild -destination 'platform=iOS Simulator,name=iPhone 17' build`.
