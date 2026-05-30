# PWA Wave 2 — Design System & UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the barebones prototype into an app that feels like a polished, native iOS application. Establish a token-driven design system + a small set of bespoke React primitives, then re-skin every existing screen on top of it — so the remaining feature waves (Media, Change Orders, Tasks, …) inherit the polish instead of accumulating more rough UI.

**Direction (locked with Raj):**
- **Aesthetic:** iOS-native feel — large-title headers, grouped inset lists, bottom sheets, system font, construction-orange accent.
- **Components:** custom lightweight system (no shadcn/MUI). Targeted micro-deps only: `lucide-react` for icons. Charts hand-rolled SVG. Sheets hand-rolled.
- **In scope:** dashboard data-viz, dark mode, motion & transitions, PWA-native polish (pull-to-refresh, install prompt, refined icon/splash).

**Architecture:** CSS custom-property tokens (`styles/`) drive light/dark theming. Bespoke primitives live in `src/components/ui/`; charts in `src/components/charts/`. Screens compose primitives — no ad-hoc class soup. **Accessibility names/roles are preserved** so the Wave 1 e2e (`getByRole`/`getByLabel`) stays green; the re-skin is visual, not semantic.

**Tech Stack:** Same as Wave 0/1 + `lucide-react`. No CSS framework; no component library.

**Guardrails:** Every task ends with `npm run test` green and the build clean. The budget-loop e2e must keep passing after each screen re-skin (Tasks 4–8) — if a selector breaks, fix the component's accessible name, not the test.

---

### Task 1: Design tokens + theming foundation
**Files:** Create `web/src/styles/tokens.css`, `web/src/styles/base.css`; refactor `src/index.css` to consume tokens; create `src/lib/theme.ts` (+ `theme.test.ts`)
- [x] Tokens as CSS custom properties: neutral ramp (50–900), brand (construction orange), semantic (success/warn/danger/info), surface/text/border; type scale, spacing scale, radii, elevation shadows, z-index layers, motion durations + easings. Light values on `:root`, dark overrides on `:root[data-theme='dark']`; theme.ts resolves system → light|dark so CSS needs no media query.
- [x] `theme.ts`: `getStoredTheme()/setTheme('light'|'dark'|'system')` persisting to localStorage, applying `data-theme` on `<html>`, defaulting to system. Unit-tested (globals stubbed; no jsdom). Commit.

### Task 2: Icon system + input primitives
**Files:** add `lucide-react`; create `src/components/ui/{Icon,Button,Field,Select,Badge,SegmentedControl}.tsx` + `Button.test.tsx`, `Field.test.tsx`
- [ ] `Button` (variants primary/secondary/ghost/danger, sizes sm/md/lg, optional leading icon, `loading` spinner, full-width). `Field` (label + control + hint + error, wires `id`/`aria-describedby`/`aria-invalid`). `Select` (styled native select + chevron). `Badge`/`StatusPill` (semantic tone). `SegmentedControl` (iOS-style, `role=tablist`). `Icon` thin wrapper over lucide with sized defaults.
- [ ] Tests: Button renders variant/loading + keeps accessible name; Field shows error and links `aria-describedby`. Run tests. Commit.

### Task 3: Overlay + feedback primitives
**Files:** create `src/components/ui/{Sheet,Modal,Toast,EmptyState,Skeleton,Spinner}.tsx`, `src/components/ui/ToastProvider.tsx` + `Sheet.test.tsx`, `Toast.test.tsx`
- [ ] `Sheet`: iOS bottom-sheet (backdrop, rounded top, safe-area pad, drag-handle, swipe/Escape/backdrop dismiss, focus trap, scroll lock). `Modal` = centered variant sharing the same shell. `Toast` provider + `useToast()` (success/error, auto-dismiss, stacked, `role=status`). `EmptyState` (icon + title + body + optional action). `Skeleton` (shimmer) + `Spinner`.
- [ ] Tests: Sheet opens/closes via backdrop + Escape and traps focus; `useToast` enqueues and auto-dismisses. Mount `ToastProvider` in `main.tsx`. Run tests. Commit.

### Task 4: App shell + navigation re-skin
**Files:** rewrite `src/app/AppShell.tsx`; create `src/app/{ScreenHeader,TabBar}.tsx`, `src/features/more/MoreScreen.tsx` (theme toggle); update `index.html` theme-color metas
- [ ] iOS large-title `ScreenHeader` (title + optional subtitle + trailing action slot, safe-area top). Icon `TabBar` (lucide glyph + label per tab, active tint, safe-area bottom, 44px targets). Light/dark `theme-color` metas. Dark-mode toggle (SegmentedControl) lives in `MoreScreen`.
- [ ] Preserve `nav[aria-label="Primary"]` and link names (Dashboard/Budget/Expenses/Photos/More). Run `npm run test` + `npm run e2e`. Commit.

### Task 5: Re-skin Projects + Project form
**Files:** rewrite `src/features/projects/{ProjectsScreen,ProjectForm}.tsx`; create `src/components/ui/CurrencyField.tsx` (+ test)
- [ ] Project cards: name, address, status pill, budget + spend progress bar, chevron. Trash/restore in a sheet/confirm. `ProjectForm` opened in a `Sheet`, **sectioned** (Basics / Budget / Structure / Dates / Notes) with `CurrencyField` (formatted `$` input over cents) for money fields.
- [ ] Keep accessible labels (`Name`, `Construction budget`, button `New project`/`Save`) so e2e passes. Test `CurrencyField`. Run test + e2e. Commit.

### Task 6: Re-skin Budget screen
**Files:** rewrite `src/features/budget/{BudgetScreen,CategoryForm,LineItemForm}.tsx`; reuse `HealthPill`
- [ ] Grouped inset list: category header with roll-up (budget vs actual + mini progress), disclosure to line items each showing title, `HealthPill`, budget/actual, per-line progress in health color. Category/line-item forms in sheets. Empty states via `EmptyState`.
- [ ] Preserve `Add category` / `+ Line item` / `Title` / `Budget` accessible names. Run test + e2e. Commit.

### Task 7: Re-skin Expenses
**Files:** rewrite `src/features/expenses/{ExpenseList,ExpenseForm}.tsx`
- [ ] Summary tiles (invoiced/paid/open), `SegmentedControl` filter (All/Open/Paid), list rows (vendor, date, category, amount, paid/open badge, receipt glyph). `ExpenseForm` in a `Sheet`, sectioned, `CurrencyField` for amount/amount-paid, line-item select. Toast on save/delete.
- [ ] Preserve `Add expense` / `Vendor` / `Amount` / `Budget line` / `Amount paid` / `Save expense` names. Run test + e2e. Commit.

### Task 8: Dashboard redesign + data-viz
**Files:** rewrite `src/features/dashboard/DashboardScreen.tsx`; create `src/components/charts/{Donut,BarRow,Sparkline}.tsx` + `charts.test.ts`
- [ ] Hand-rolled SVG charts: `Donut` (budget used vs remaining, health-tinted), `BarRow` (spend by category), `Sparkline`/area (spend-over-time from expense dates). Hero health summary card, metric tiles, attention list, recent activity. Loading → `Skeleton`s.
- [ ] Unit-test chart geometry (arc fractions sum to 1; bar widths clamp 0–100%; sparkline points map to viewBox). Run tests. Commit.

### Task 9: Motion + PWA-native polish
**Files:** create `src/lib/{useInstallPrompt,usePullToRefresh}.ts`, `src/components/ui/PageTransition.tsx`; update `src/main.tsx`, `vite.config.ts` PWA manifest, `bin/gen-icons` output / `public/` icons
- [ ] Route + sheet enter/exit transitions (CSS-driven, respect `prefers-reduced-motion`); skeleton shimmer. `usePullToRefresh` (TanStack `invalidate` on overscroll). `useInstallPrompt` (capture `beforeinstallprompt`, show an install affordance in More). Refine manifest (maskable icon, `theme_color` per scheme, splash); verify `display: standalone`.
- [ ] Run `npm run test`. Commit.

### Task 10: Verify + ship
- [ ] Full `npm run test` + `npm run e2e` green; `npm run build` clean; visual pass on key screens (light + dark) via Playwright screenshots. Deploy (`cd web && npx vercel deploy --prod --scope rshah112s-projects`). Commit.

## Self-Review
- Addresses Raj's brief (UI/UX overhaul, iOS-native, custom system, all four big lifts) before resuming feature waves; the system in T1–T3 is what Waves 3–5 will build on.
- e2e safety: Tasks 4–8 each re-run `npm run e2e` and explicitly preserve accessible names, so the budget-loop spec stays green through the re-skin.
- No new heavy deps: only `lucide-react`; charts/sheets/motion are bespoke, keeping the bundle small (the >500 kB warning stays in check).
- Testable where it counts: theme resolve, primitives (Button/Field/Sheet/Toast), CurrencyField, and chart geometry get unit/component tests; visuals get a screenshot pass in T10.
