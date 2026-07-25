-- Teach the transactional restore RPC about the loan treasury ledger added in 0020, so a
-- backup no longer silently drops draws' disbursements and their reimbursement allocations.
--
-- Backup version 3 carries the two new sections. Versions 1-2 remain restorable: the client
-- back-fills the sections empty, and this function accepts either version.
set search_path to buildtracker;

create or replace function restore_project_backup(payload jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = buildtracker, pg_temp
as $$
declare
  actor uuid := auth.uid();
  new_project_id uuid := gen_random_uuid();
  section text;
  item_count integer := 0;
  sections constant text[] := array[
    'categories', 'line_items', 'expenses', 'change_orders', 'allowance_selections',
    'vendors', 'tasks', 'bid_packages', 'bids', 'photos', 'documents', 'loans',
    'loan_draws', 'disbursements', 'allocations', 'phases', 'lien_waivers'
  ];
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid backup payload' using errcode = '22023';
  end if;
  if pg_column_size(payload) > 50 * 1024 * 1024 then
    raise exception 'backup exceeds the 50 MB restore limit' using errcode = '54000';
  end if;
  if coalesce(payload->>'backup_version', '') not in ('2', '3') then
    raise exception 'unsupported normalized backup version' using errcode = '22023';
  end if;
  if jsonb_typeof(payload->'project') <> 'object'
     or nullif(trim(payload#>>'{project,name}'), '') is null then
    raise exception 'backup project metadata is incomplete' using errcode = '22023';
  end if;

  foreach section in array sections loop
    -- A version-2 payload predates the treasury ledger; treat those sections as empty
    -- rather than rejecting an older backup that is otherwise perfectly valid.
    if payload->section is null and section in ('disbursements', 'allocations') then
      continue;
    end if;
    if jsonb_typeof(payload->section) <> 'array' then
      raise exception 'backup section % is missing or invalid', section using errcode = '22023';
    end if;
    item_count := item_count + jsonb_array_length(payload->section);
  end loop;
  if item_count > 100000 then
    raise exception 'backup contains too many records' using errcode = '54000';
  end if;

  insert into projects
  select populated.*
  from jsonb_populate_record(
    null::projects,
    payload->'project' || jsonb_build_object(
      'id', new_project_id,
      'owner', actor,
      'deleted_at', null
    )
  ) populated;

  perform set_config('buildtracker.restoring_backup', 'on', true);

  insert into budget_categories
  select populated.* from jsonb_array_elements(payload->'categories') as source(entry)
  cross join lateral jsonb_populate_record(
    null::budget_categories,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into budget_line_items
  select populated.* from jsonb_array_elements(payload->'line_items') as source(entry)
  cross join lateral jsonb_populate_record(
    null::budget_line_items,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id, 'actual', 0)
  ) populated;

  insert into vendors
  select populated.* from jsonb_array_elements(payload->'vendors') as source(entry)
  cross join lateral jsonb_populate_record(
    null::vendors,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into change_orders
  select populated.* from jsonb_array_elements(payload->'change_orders') as source(entry)
  cross join lateral jsonb_populate_record(
    null::change_orders,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into photo_attachments
  select populated.* from jsonb_array_elements(payload->'photos') as source(entry)
  cross join lateral jsonb_populate_record(
    null::photo_attachments,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into bid_packages
  select populated.* from jsonb_array_elements(payload->'bid_packages') as source(entry)
  cross join lateral jsonb_populate_record(
    null::bid_packages,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into bids
  select populated.* from jsonb_array_elements(payload->'bids') as source(entry)
  cross join lateral jsonb_populate_record(
    null::bids,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into expenses
  select populated.* from jsonb_array_elements(payload->'expenses') as source(entry)
  cross join lateral jsonb_populate_record(
    null::expenses,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into allowance_selections
  select populated.* from jsonb_array_elements(payload->'allowance_selections') as source(entry)
  cross join lateral jsonb_populate_record(
    null::allowance_selections,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into project_tasks
  select populated.* from jsonb_array_elements(payload->'tasks') as source(entry)
  cross join lateral jsonb_populate_record(
    null::project_tasks,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into project_documents
  select populated.* from jsonb_array_elements(payload->'documents') as source(entry)
  cross join lateral jsonb_populate_record(
    null::project_documents,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into lien_waivers
  select populated.* from jsonb_array_elements(payload->'lien_waivers') as source(entry)
  cross join lateral jsonb_populate_record(
    null::lien_waivers,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into construction_loans
  select populated.* from jsonb_array_elements(payload->'loans') as source(entry)
  cross join lateral jsonb_populate_record(
    null::construction_loans,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into loan_draws
  select populated.* from jsonb_array_elements(payload->'loan_draws') as source(entry)
  cross join lateral jsonb_populate_record(
    null::loan_draws,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  -- Treasury ledger. Inserted after draws and expenses so the guard triggers in 0020 see
  -- their parents; an over-disbursed or over-allocated payload aborts the whole restore.
  insert into draw_disbursements
  select populated.* from jsonb_array_elements(coalesce(payload->'disbursements', '[]'::jsonb)) as source(entry)
  cross join lateral jsonb_populate_record(
    null::draw_disbursements,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into disbursement_allocations
  select populated.* from jsonb_array_elements(coalesce(payload->'allocations', '[]'::jsonb)) as source(entry)
  cross join lateral jsonb_populate_record(
    null::disbursement_allocations,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  insert into phases
  select populated.* from jsonb_array_elements(payload->'phases') as source(entry)
  cross join lateral jsonb_populate_record(
    null::phases,
    entry || jsonb_build_object('owner', actor, 'project_id', new_project_id)
  ) populated;

  -- Plain UUID references intentionally lack schema FKs in older migrations. Refuse any
  -- payload that reaches outside this newly-created project before committing it.
  if exists (
    select 1 from change_orders source_row where source_row.project_id = new_project_id
      and source_row.budget_line_item_id is not null
      and not exists (select 1 from budget_line_items target where target.project_id = new_project_id and target.id = source_row.budget_line_item_id)
    union all
    select 1 from photo_attachments source_row where source_row.project_id = new_project_id
      and source_row.budget_line_item_id is not null
      and not exists (select 1 from budget_line_items target where target.project_id = new_project_id and target.id = source_row.budget_line_item_id)
    union all
    select 1 from bids source_row where source_row.project_id = new_project_id and (
      not exists (select 1 from bid_packages target where target.project_id = new_project_id and target.id = source_row.package_id)
      or (source_row.vendor_id is not null and not exists (select 1 from vendors target where target.project_id = new_project_id and target.id = source_row.vendor_id))
    )
    union all
    select 1 from bid_packages source_row where source_row.project_id = new_project_id
      and source_row.awarded_bid_id is not null
      and not exists (select 1 from bids target where target.project_id = new_project_id and target.id = source_row.awarded_bid_id)
    union all
    select 1 from expenses source_row where source_row.project_id = new_project_id and (
      (source_row.budget_line_item_id is not null and not exists (select 1 from budget_line_items target where target.project_id = new_project_id and target.id = source_row.budget_line_item_id))
      or (source_row.vendor_id is not null and not exists (select 1 from vendors target where target.project_id = new_project_id and target.id = source_row.vendor_id))
      or (source_row.change_order_id is not null and not exists (select 1 from change_orders target where target.project_id = new_project_id and target.id = source_row.change_order_id))
    )
    union all
    select 1 from allowance_selections source_row where source_row.project_id = new_project_id
      and not exists (select 1 from budget_line_items target where target.project_id = new_project_id and target.id = source_row.line_item_id)
    union all
    select 1 from project_tasks source_row where source_row.project_id = new_project_id and (
      (source_row.vendor_id is not null and not exists (select 1 from vendors target where target.project_id = new_project_id and target.id = source_row.vendor_id))
      or (source_row.budget_line_item_id is not null and not exists (select 1 from budget_line_items target where target.project_id = new_project_id and target.id = source_row.budget_line_item_id))
      or exists (
        select 1 from unnest(source_row.photo_ids) photo_id
        where not exists (select 1 from photo_attachments target where target.project_id = new_project_id and target.id = photo_id)
      )
    )
    union all
    select 1 from project_documents source_row where source_row.project_id = new_project_id
      and source_row.budget_line_item_id is not null
      and not exists (select 1 from budget_line_items target where target.project_id = new_project_id and target.id = source_row.budget_line_item_id)
    union all
    select 1 from lien_waivers source_row where source_row.project_id = new_project_id
      and source_row.expense_id is not null
      and not exists (select 1 from expenses target where target.project_id = new_project_id and target.id = source_row.expense_id)
    union all
    select 1 from loan_draws source_row where source_row.project_id = new_project_id
      and not exists (select 1 from construction_loans target where target.project_id = new_project_id and target.id = source_row.loan_id)
    union all
    select 1 from draw_disbursements source_row where source_row.project_id = new_project_id and (
      not exists (select 1 from loan_draws target where target.project_id = new_project_id and target.id = source_row.draw_id)
      or (source_row.vendor_id is not null and not exists (select 1 from vendors target where target.project_id = new_project_id and target.id = source_row.vendor_id))
    )
    union all
    select 1 from disbursement_allocations source_row where source_row.project_id = new_project_id and (
      not exists (select 1 from draw_disbursements target where target.project_id = new_project_id and target.id = source_row.disbursement_id)
      or not exists (select 1 from expenses target where target.project_id = new_project_id and target.id = source_row.expense_id)
    )
  ) then
    raise exception 'restored backup contains an invalid cross-project reference' using errcode = '23503';
  end if;

  perform set_config('buildtracker.restoring_backup', 'off', true);
  perform reconcile_project_actuals(new_project_id);
  return new_project_id;
end;
$$;

revoke all on function restore_project_backup(jsonb) from public, anon;
grant execute on function restore_project_backup(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
