# RESUME HANDOFF — read this first (2026-05-30)

A large parallel tool batch left git in a **diverged, possibly-broken** state. Recover
carefully, **one command at a time — NO big parallel batches.**

## Git state (verify with `git status -sb` + `git fetch`)
- **local HEAD = `1b336d8`** ("QA ops-workflows e2e + gap analysis"), **ahead 4, behind 3** vs `origin/pwa-edition`.
- Local lineage is built on **`71b6d72` = Wave 5 COMPLETE** (has `web/src/features/cashflow/`, `web/src/features/export/`, real Photos). ✅ Local is the SOURCE OF TRUTH.
- **`origin/pwa-edition = 70807f8` is BROKEN**: built on `3762803` (Wave 4) — it is **MISSING ALL OF WAVE 5**. It got there because earlier I did a wrong `git reset --hard origin` then pushed audit-fixes onto the Wave-4 base. **DO NOT merge/pull origin. DO NOT reset to origin.** Plan = make local correct, then `git push --force-with-lease origin pwa-edition` to overwrite origin.
- 2 uncommitted working-tree files: `DashboardScreen.tsx` (localToday) + `currentProject.tsx` (RequireProject validation) — GOOD fixes, keep them.
- All commits recoverable via `git reflog`. Wave 5 commits: `5ae89e8`, `ae5c885`, `71b6d72`.

## KNOWN PROBLEM: commit `65ee744` built with ERRORS
At commit time the build failed:
- `src/features/bids/BidsScreen.tsx: Cannot find name 'unaward'`
- `src/features/dashboard/DashboardScreen.tsx: Cannot find name 'localToday'`
These may be fixed by the 2 uncommitted files + edits, OR still broken. **MUST run `npm run build` and confirm clean before pushing/deploying.**

## RECOVERY STEPS (sequential)
1. `cd web && git stash list` (nothing) ; review the 2 modified files are the good fixes (they are).
2. Verify all 10 audit fixes are present by grepping each file (list below). Re-apply any missing.
3. `cd web && npx eslint .` → must be clean.
4. `cd web && npm run build` → must have ZERO `error TS`. Fix `unaward`/`localToday` if still missing.
5. `cd web && npm test` → expect ~97 passing (incl. cashFlow.test.ts, casing.roundtrip.test.ts).
6. Ensure local Supabase up (`supabase start`; `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/rest/v1/` == 200), then `npm run e2e` → expect 4 specs green (smoke, budget-loop, change-order, full-workflows).
   - NOTE: `tests/e2e/full-workflows.spec.ts` was rewritten; bid step types vendor "Acme Framing Co", awards, expects "Unaward", unawards, expects "Award". If award/unaward race flakes, the prior failure was the assertion timing — verify the Unaward/Award button toggle logic in BidsScreen renders synchronously.
7. Commit the 2 files. Then **`git push --force-with-lease origin pwa-edition`** (overwrites the broken origin). Verify `git rev-parse HEAD == git rev-parse origin/pwa-edition` after.
8. Deploy: `cd web && npx vercel deploy --prod --yes --scope rshah112s-projects`. Smoke: `curl -s -o /dev/null -w '%{http_code}' https://buildtrackerpro.vercel.app/` == 200.

## The 10 audit fixes — verify each is in HEAD (grep)
1. `currentProject.tsx` RequireProject: `valid = projectId != null && active.some(...)`; effect clears stale id. (uncommitted — commit it)
2. `ProjectForm.tsx` Stories input: inline `onChange` `e.target.value === '' ? 0 : Number(...)` (NOT `num('stories')`). ⚠️ system-reminder showed it MAY have reverted to `num('stories')` — RE-CHECK & re-apply.
3. `ProjectsScreen.tsx` header `trailing={active.length > 0 ? (<Button>New project) : undefined}`. ⚠️ reminder showed it MAY be unconditional again — RE-CHECK & re-apply.
4. `export/backup.ts` `restoreBackup` uses `insertMapped` + `remap` building oldId→newId maps. ⚠️ reminder showed backup.ts MAY still be the simple `insertAll` version — RE-CHECK & re-apply (full version in git commit 65ee744 if present, else rewrite per audit).
5. `auth/useSession.ts` signOut: `localStorage.removeItem('btp.currentProjectId')`. ⚠️ reminder showed simple version — RE-CHECK & re-apply.
6. `bids/BidsScreen.tsx`: `award` clears prior `awardedBidId`'s awardedAt; add `unaward`; render `{awarded ? <Unaward> : <Award>}`. (this is the source of the `unaward` build error — ensure all 3 parts present)
7. `cashflow/cashFlow.ts` export `localToday()`; `CashFlowScreen.tsx` + `DashboardScreen.tsx` import & use it instead of `new Date().toISOString()`.
8. `lib/casing.ts` `snakeKey = s.replace(/_([a-z])/g, ...)` (NOT `[a-z0-9]`); `src/lib/casing.roundtrip.test.ts` exists.
9. `components/ui/CurrencyField.tsx` parseCurrency keeps first decimal point. ⚠️ reminder showed simple version — RE-CHECK & re-apply.
10. `photos/PhotoThumb.tsx` effect revokes `blob:` object URLs on cleanup.

## After recovery — REMAINING AUTOPILOT WORK
- This was the last piece of the user's autopilot run. Waves 0–5 are DONE. Audit done. Once the 10 fixes are verified green + pushed + deployed, the build work is COMPLETE.
- `docs/superpowers/GAP-ANALYSIS.md` exists (next-feature roadmap + manual tasks).
- Then give the user the FINAL REPORT (below).

## FINAL REPORT FOR USER (deliver after recovery)
**Done this run:** Wave 5 (cash-flow forecast [golden-tested], Excel workbook, PDF report, JSON backup+restore with id remapping, Photos gallery, room catalog). Multi-agent audit of Waves 3–5 found+fixed 10 real bugs. Comprehensive ops e2e added. Gap analysis written.
**App status:** Waves 0–5 complete; live at https://buildtrackerpro.vercel.app; seeded $1.3M project for rajrulz@aol.com.
**⚠️ NEEDS YOU (manual):**
1. **Cloudflare R2** — create bucket + API token (Account ID, Access Key, Secret, bucket name) so photo/receipt/document uploads work in production. Give me the 4 values → I set Vercel env (`SUPABASE_SERVICE_ROLE`, `R2_*`) + redeploy. Until then Photos work only in local dev.
2. **Refine seeded budget** with real contract/bid numbers (current values are realistic estimates).
3. **Set project address + start/target dates** (seeded blank).
4. (Optional) custom domain.
**Suggested next features (see GAP-ANALYSIS.md):** Project Documents UI (permits/contracts — high value), soft-delete/Trash for child entities (data safety), Room Summary, loan-draw tracking.

## LESSON (also in memory project-status.md)
Local was "ahead" with unpushed Wave 5; `git reset --hard origin` discarded it. Always push unpushed commits; never reset to a behind-remote; after push verify `HEAD == origin/<branch>`. Avoid giant parallel tool batches that interleave git ops + edits — they cause "modified since read" races and ambiguous state.
