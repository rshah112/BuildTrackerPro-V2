-- Expense funding source: tag each expense as paid from personal funds vs the construction
-- loan, so personal vs loan spend can be tracked separately. Nullable-ish text (default ''
-- = personal/unset); the UI only surfaces the choice when the project has a loan.
-- Additive; buildtracker schema only.

set search_path to buildtracker;

alter table expenses add column if not exists funding_source text not null default '';

notify pgrst, 'reload schema';
