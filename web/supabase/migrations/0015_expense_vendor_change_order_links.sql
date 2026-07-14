-- Stable vendor/change-order links for expenses. `vendor_name` and line-item titles remain
-- snapshots for display; these nullable ids let tax reports survive vendor renames and let
-- aggregate math recognize an invoice that represents a change order.
set search_path to buildtracker;

alter table expenses add column if not exists vendor_id uuid;
alter table expenses add column if not exists change_order_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_vendor_id_fkey' and conrelid = 'buildtracker.expenses'::regclass
  ) then
    alter table expenses
      add constraint expenses_vendor_id_fkey foreign key (vendor_id) references vendors (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_change_order_id_fkey' and conrelid = 'buildtracker.expenses'::regclass
  ) then
    alter table expenses
      add constraint expenses_change_order_id_fkey foreign key (change_order_id) references change_orders (id) on delete set null;
  end if;
end $$;

-- Preserve the user's existing history where a project has exactly one active vendor whose
-- normalized name matches the expense snapshot. Ambiguous duplicate names are intentionally
-- left null for human review instead of being guessed.
with unambiguous_vendor as (
  select
    expense.id as expense_id,
    (array_agg(vendor.id order by vendor.id))[1] as vendor_id
  from expenses expense
  join vendors vendor
    on vendor.owner = expense.owner
   and vendor.project_id = expense.project_id
   and lower(trim(vendor.name)) = lower(trim(expense.vendor_name))
   and vendor.deleted_at is null
  where expense.vendor_id is null
    and trim(expense.vendor_name) <> ''
  group by expense.id
  having count(*) = 1
)
update expenses expense
set vendor_id = match.vendor_id
from unambiguous_vendor match
where expense.id = match.expense_id;

create index if not exists idx_expenses_vendor on expenses (vendor_id) where deleted_at is null;
create index if not exists idx_expenses_change_order on expenses (change_order_id) where deleted_at is null;

notify pgrst, 'reload schema';
