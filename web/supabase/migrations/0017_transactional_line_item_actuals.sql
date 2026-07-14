-- Make stored line-item actuals authoritative under concurrent clients. Financial
-- mutations trigger one project-scoped reconciliation inside the same database
-- transaction; an advisory transaction lock serializes competing project refreshes.
set search_path to buildtracker;

create or replace function calculated_line_item_actual(
  target_project uuid,
  target_item uuid,
  target_title text,
  target_category text,
  target_is_allowance boolean
)
returns numeric
language sql
stable
security invoker
set search_path = buildtracker, pg_temp
as $$
  select case
    when target_is_allowance and exists (
      select 1
      from allowance_selections selection
      where selection.project_id = target_project
        and selection.line_item_id = target_item
        and selection.deleted_at is null
    ) then coalesce((
      select sum(selection.amount)
      from allowance_selections selection
      where selection.project_id = target_project
        and selection.line_item_id = target_item
        and selection.deleted_at is null
    ), 0)
    else
      coalesce((
        select sum(expense.amount)
        from expenses expense
        where expense.project_id = target_project
          and expense.deleted_at is null
          and (
            expense.budget_line_item_id = target_item
            or (
              not exists (
                select 1 from budget_line_items linked
                where linked.id = expense.budget_line_item_id
                  and linked.project_id = target_project
                  and linked.deleted_at is null
              )
              and trim(coalesce(expense.budget_line_item_title, '')) <> ''
              and lower(trim(expense.budget_line_item_title)) = lower(trim(target_title))
              and lower(trim(coalesce(expense.category_name, ''))) = lower(trim(coalesce(target_category, '')))
              and not exists (
                select 1 from budget_line_items earlier
                where earlier.project_id = target_project
                  and earlier.deleted_at is null
                  and earlier.id < target_item
                  and lower(trim(earlier.title)) = lower(trim(target_title))
                  and lower(trim(earlier.category_name)) = lower(trim(coalesce(target_category, '')))
              )
            )
          )
      ), 0)
      +
      coalesce((
        select sum(change_order.amount)
        from change_orders change_order
        where change_order.project_id = target_project
          and change_order.deleted_at is null
          and change_order.status = 'paid'
          and (
            change_order.budget_line_item_id = target_item
            or (
              not exists (
                select 1 from budget_line_items linked
                where linked.id = change_order.budget_line_item_id
                  and linked.project_id = target_project
                  and linked.deleted_at is null
              )
              and trim(coalesce(change_order.budget_line_item_title, '')) <> ''
              and lower(trim(change_order.budget_line_item_title)) = lower(trim(target_title))
              and lower(trim(coalesce(change_order.category_name, ''))) = lower(trim(coalesce(target_category, '')))
              and not exists (
                select 1 from budget_line_items earlier
                where earlier.project_id = target_project
                  and earlier.deleted_at is null
                  and earlier.id < target_item
                  and lower(trim(earlier.title)) = lower(trim(target_title))
                  and lower(trim(earlier.category_name)) = lower(trim(coalesce(target_category, '')))
              )
            )
          )
          and not exists (
            select 1
            from expenses linked_expense
            where linked_expense.project_id = target_project
              and linked_expense.deleted_at is null
              and linked_expense.change_order_id = change_order.id
          )
      ), 0)
  end;
$$;

create or replace function reconcile_project_actuals(target_project uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = buildtracker, pg_temp
as $$
begin
  if target_project is null then
    return;
  end if;

  -- Direct RPC calls must own the project. Trigger calls still run under the same
  -- authenticated mutation context; service-role maintenance has auth.uid() null.
  if auth.uid() is not null and not exists (
    select 1 from projects project
    where project.id = target_project and project.owner = auth.uid()
  ) then
    raise exception 'project not found or access denied' using errcode = '42501';
  end if;

  -- Keep a single lock order everywhere: account -> project -> line-item rows.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(auth.uid()::text, 'service-role-financial-write'), 917031)
  );
  perform pg_advisory_xact_lock(hashtextextended(target_project::text, 0));

  -- Only this function may change the derived column. The transaction-local flag
  -- lets the guard below distinguish reconciliation from stale full-row clients.
  perform set_config('buildtracker.reconciling_actuals', 'on', true);
  update budget_line_items item
  set actual = calculated_line_item_actual(
    target_project,
    item.id,
    item.title,
    item.category_name,
    item.is_allowance
  )
  where item.project_id = target_project
    and item.deleted_at is null;
  perform set_config('buildtracker.reconciling_actuals', 'off', true);
end;
$$;

create or replace function reconcile_actuals_after_change()
returns trigger
language plpgsql
volatile
security invoker
set search_path = buildtracker, pg_temp
as $$
declare
  old_project uuid;
  new_project uuid;
begin
  if tg_op <> 'INSERT' then old_project := old.project_id; end if;
  if tg_op <> 'DELETE' then new_project := new.project_id; end if;

  if old_project is not null then
    -- A parent project DELETE cascades after the project tuple is already gone. Only
    -- that DELETE case may skip reconciliation; INSERT/UPDATE must always run the
    -- ownership check, even when RLS hides a foreign project.
    if tg_op <> 'DELETE' or exists (select 1 from projects where id = old_project) then
      perform reconcile_project_actuals(old_project);
    end if;
  end if;
  if new_project is not null and new_project is distinct from old_project then
    perform reconcile_project_actuals(new_project);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- `actual` is derived financial data, not a client-editable field. Older app builds
-- and durable offline payloads may still send a full row containing it: an unchanged
-- value is harmless, while a changed value must fail instead of silently corrupting
-- totals. The transaction trigger below then refreshes the row from source records.
create or replace function protect_line_item_actual()
returns trigger
language plpgsql
volatile
security invoker
set search_path = buildtracker, pg_temp
as $$
begin
  if new.actual is distinct from old.actual
     and current_setting('buildtracker.reconciling_actuals', true) is distinct from 'on' then
    raise exception 'budget line item actual is derived and cannot be edited directly'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Row locks are taken before an AFTER ROW trigger runs. Acquire a per-account
-- transaction lock at BEFORE STATEMENT time so two multi-row financial statements
-- cannot hold different source rows while waiting on each other's reconciliation.
create or replace function serialize_financial_write()
returns trigger
language plpgsql
volatile
security invoker
set search_path = buildtracker, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(auth.uid()::text, 'service-role-financial-write'), 917031)
  );
  return null;
end;
$$;

-- FK cascades otherwise lock the parent before reaching a child-table trigger,
-- inverting the account-first order used by ordinary financial writes.
drop trigger if exists projects_serialize_financial_cascade on projects;
create trigger projects_serialize_financial_cascade
before delete on projects
for each statement execute function serialize_financial_write();

drop trigger if exists vendors_serialize_financial_cascade on vendors;
create trigger vendors_serialize_financial_cascade
before delete on vendors
for each statement execute function serialize_financial_write();

drop trigger if exists expenses_serialize_reconcile on expenses;
create trigger expenses_serialize_reconcile
before insert or update or delete on expenses
for each statement execute function serialize_financial_write();

drop trigger if exists expenses_reconcile_actuals on expenses;
create trigger expenses_reconcile_actuals
after insert or delete or update of
  project_id, amount, budget_line_item_id, budget_line_item_title,
  category_name, change_order_id, deleted_at
on expenses for each row execute function reconcile_actuals_after_change();

drop trigger if exists change_orders_serialize_reconcile on change_orders;
create trigger change_orders_serialize_reconcile
before insert or update or delete on change_orders
for each statement execute function serialize_financial_write();

drop trigger if exists change_orders_reconcile_actuals on change_orders;
create trigger change_orders_reconcile_actuals
after insert or delete or update of
  project_id, amount, status, budget_line_item_id, budget_line_item_title,
  category_name, deleted_at
on change_orders for each row execute function reconcile_actuals_after_change();

drop trigger if exists allowance_selections_serialize_reconcile on allowance_selections;
create trigger allowance_selections_serialize_reconcile
before insert or update or delete on allowance_selections
for each statement execute function serialize_financial_write();

drop trigger if exists allowance_selections_reconcile_actuals on allowance_selections;
create trigger allowance_selections_reconcile_actuals
after insert or delete or update of project_id, line_item_id, amount, deleted_at
on allowance_selections for each row execute function reconcile_actuals_after_change();

drop trigger if exists budget_line_items_serialize_reconcile on budget_line_items;
create trigger budget_line_items_serialize_reconcile
before insert or update or delete on budget_line_items
for each statement execute function serialize_financial_write();

drop trigger if exists budget_line_items_protect_actual on budget_line_items;
create trigger budget_line_items_protect_actual
before update of actual on budget_line_items
for each row execute function protect_line_item_actual();

drop trigger if exists budget_line_items_reconcile_actuals on budget_line_items;
create trigger budget_line_items_reconcile_actuals
after insert or delete or update of project_id, title, category_name, is_allowance, deleted_at
on budget_line_items for each row execute function reconcile_actuals_after_change();

revoke all on function calculated_line_item_actual(uuid, uuid, text, text, boolean) from public, anon;
revoke all on function reconcile_project_actuals(uuid) from public, anon;
revoke all on function reconcile_actuals_after_change() from public, anon;
revoke all on function serialize_financial_write() from public, anon;
revoke all on function protect_line_item_actual() from public, anon;
revoke execute on function reconcile_actuals_after_change() from authenticated;
revoke execute on function serialize_financial_write() from authenticated;
revoke execute on function protect_line_item_actual() from authenticated;
grant execute on function calculated_line_item_actual(uuid, uuid, text, text, boolean) to authenticated, service_role;
grant execute on function reconcile_project_actuals(uuid) to authenticated, service_role;

-- Bring existing rows into agreement when the migration is applied.
do $$
declare
  project_row record;
begin
  for project_row in select id from projects loop
    perform reconcile_project_actuals(project_row.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
