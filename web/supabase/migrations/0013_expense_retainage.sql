-- Retainage: the amount withheld on an expense's payment, held until completion (typically 5-10%
-- on subcontractor work). Additive, default 0, buildtracker only — existing RLS/grants on
-- `expenses` cover it. Applied to prod 2026-06-08 via the Management API.
set search_path to buildtracker;

alter table expenses add column if not exists retainage_amount numeric not null default 0;

notify pgrst, 'reload schema';
