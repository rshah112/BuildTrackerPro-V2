-- Land acquisition: track the lot purchase + closing costs as part of the project's all-in cost.
-- `purchase_price` already exists (the lot/land purchase price); this adds the closing costs that
-- go with it. Both are kept SEPARATE from the construction/contingency budget math so they don't
-- distort construction variance — they only feed the "all-in project cost" total. Additive,
-- default 0, buildtracker only — existing RLS/grants on `projects` cover it.
set search_path to buildtracker;

alter table projects add column if not exists closing_costs numeric(14,2) not null default 0;

notify pgrst, 'reload schema';
