begin;

set local search_path = buildtracker, extensions, public;

select plan(11);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '30000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'restore-owner@test.invalid',
  now(),
  now()
);

create temporary table restore_fixture (payload jsonb not null);
insert into restore_fixture values ($json$
{
  "backup_version": 2,
  "project": {
    "id": "99999999-0000-0000-0000-000000000001",
    "owner": "99999999-0000-0000-0000-000000000999",
    "name": "Atomic restore (restored)",
    "address": "1 Recovery Way",
    "status": "active",
    "priority": "high",
    "template_type": "custom",
    "purchase_price": 100,
    "closing_costs": 10,
    "square_footage": 1200,
    "lot_dimensions": "",
    "proposed_build_dimensions": "",
    "footprint": "",
    "stories": 2,
    "basement": "",
    "scope_summary": "",
    "warranty_notes": "",
    "start_date": null,
    "target_finish_date": null,
    "construction_budget": 1000,
    "contingency_budget": 100,
    "created_at": "2026-07-13T12:00:00Z",
    "deleted_at": null
  },
  "categories": [],
  "line_items": [{
    "id": "30000000-0000-0000-0000-000000000100",
    "cost_code": "03-100",
    "title": "Concrete",
    "category_name": "Foundation",
    "room_tag": "",
    "budget": 500,
    "actual": 999,
    "committed": 0,
    "notes": "",
    "is_pinned": false,
    "is_allowance": false,
    "allowance_amount": 0,
    "created_at": "2026-07-13T12:00:00Z",
    "deleted_at": null
  }],
  "expenses": [{
    "id": "30000000-0000-0000-0000-000000000200",
    "amount": 125,
    "amount_paid": 125,
    "vendor_name": "Concrete Co",
    "vendor_id": null,
    "invoice_number": "INV-1",
    "date": "2026-07-13T12:00:00Z",
    "due_date": null,
    "expected_payment_date": null,
    "paid_date": "2026-07-13T12:00:00Z",
    "payment_method": "check",
    "payment_reference": "1",
    "category_name": "Foundation",
    "room_tag": "",
    "budget_line_item_id": "30000000-0000-0000-0000-000000000100",
    "budget_line_item_title": "Concrete",
    "change_order_id": null,
    "notes": "",
    "is_paid": true,
    "receipt_object_key": null,
    "funding_source": "personal",
    "retainage_amount": 0,
    "deleted_at": null
  }],
  "change_orders": [],
  "allowance_selections": [],
  "vendors": [],
  "tasks": [],
  "bid_packages": [],
  "bids": [],
  "photos": [],
  "documents": [],
  "loans": [],
  "loan_draws": [],
  "phases": [],
  "lien_waivers": []
}
$json$::jsonb);
grant select on restore_fixture to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

create temporary table restored_project as
select restore_project_backup(payload) as id from restore_fixture;

select is((select count(*) from restored_project), 1::bigint, 'the restore RPC returns one committed project id');

select is(
  (select project.owner from projects project join restored_project restored on restored.id = project.id),
  '30000000-0000-0000-0000-000000000003'::uuid,
  'the server overwrites untrusted backup ownership with auth.uid()'
);

select is(
  (select project.name from projects project join restored_project restored on restored.id = project.id),
  'Atomic restore (restored)',
  'project metadata is restored'
);

select is(
  (select item.actual from budget_line_items item join restored_project restored on restored.id = item.project_id),
  125::numeric,
  'derived actual is recomputed from restored sources instead of trusting the backup value'
);

select ok(
  exists (
    select 1
    from expenses expense
    join budget_line_items item on item.id = expense.budget_line_item_id
    join restored_project restored on restored.id = expense.project_id and restored.id = item.project_id
  ),
  'restored child relationships stay inside the new project'
);

select isnt(
  current_setting('buildtracker.restoring_backup', true),
  'on',
  'the transaction-local reconciliation bypass is disabled after success'
);

select throws_ok(
  format(
    'select restore_project_backup(%L::jsonb)',
    $json$
    {
      "backup_version": 2,
      "project": {
        "id": "99999999-0000-0000-0000-000000000002",
        "name": "Must roll back",
        "address": "",
        "status": "planning",
        "priority": "normal",
        "template_type": "custom",
        "purchase_price": 0,
        "closing_costs": 0,
        "square_footage": null,
        "lot_dimensions": "",
        "proposed_build_dimensions": "",
        "footprint": "",
        "stories": 0,
        "basement": "",
        "scope_summary": "",
        "warranty_notes": "",
        "start_date": null,
        "target_finish_date": null,
        "construction_budget": 0,
        "contingency_budget": 0,
        "created_at": "2026-07-13T12:00:00Z",
        "deleted_at": null
      },
      "categories": [], "line_items": [], "expenses": [], "change_orders": [],
      "allowance_selections": [], "vendors": [],
      "tasks": [{
        "id": "30000000-0000-0000-0000-000000000300",
        "title": "Dangling task",
        "status": "todo",
        "due_date": null,
        "vendor_id": "30000000-0000-0000-0000-000000000399",
        "budget_line_item_id": null,
        "photo_ids": [],
        "notes": "",
        "created_at": "2026-07-13T12:00:00Z",
        "completed_at": null,
        "deleted_at": null
      }],
      "bid_packages": [], "bids": [], "photos": [], "documents": [], "loans": [],
      "loan_draws": [], "phases": [], "lien_waivers": []
    }
    $json$
  ),
  '23503',
  'restored backup contains an invalid cross-project reference',
  'an invalid relationship aborts the restore after rows have begun inserting'
);

select is(
  (select count(*) from projects where name = 'Must roll back'),
  0::bigint,
  'a failed restore leaves no residual project'
);

select isnt(
  current_setting('buildtracker.restoring_backup', true),
  'on',
  'the reconciliation bypass cannot leak after a rolled-back restore'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  format('select restore_project_backup(%L::jsonb)', (select payload::text from restore_fixture)),
  '42501',
  'authentication required',
  'an unauthenticated caller cannot restore a backup'
);

reset role;
select is(
  (select count(*) from projects where owner is null),
  0::bigint,
  'an unauthenticated attempt cannot leave project data behind'
);

select * from finish();

rollback;
