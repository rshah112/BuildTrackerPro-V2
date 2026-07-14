begin;

set local search_path = buildtracker, extensions, public;

select plan(17);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'actuals-owner@test.invalid', now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'actuals-other@test.invalid', now(), now());

insert into projects (id, owner, name)
values
  ('10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'Owned project'),
  ('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000002', 'Other project');

insert into budget_line_items (id, owner, project_id, title, category_name)
values (
  '10000000-0000-0000-0000-000000000100',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000010',
  'Framing',
  'Structure'
);

select is(
  has_function_privilege(
    'authenticated',
    'buildtracker.reconcile_actuals_after_change()',
    'EXECUTE'
  ),
  false,
  'authenticated cannot call the row reconciliation trigger function directly'
);

select is(
  has_function_privilege(
    'authenticated',
    'buildtracker.serialize_financial_write()',
    'EXECUTE'
  ),
  false,
  'authenticated cannot call the serialization trigger function directly'
);

select is(
  has_function_privilege(
    'authenticated',
    'buildtracker.protect_line_item_actual()',
    'EXECUTE'
  ),
  false,
  'authenticated cannot call the derived-actual guard trigger function directly'
);

insert into expenses (
  id, owner, project_id, amount, budget_line_item_id,
  budget_line_item_title, category_name
)
values (
  '10000000-0000-0000-0000-000000001000',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000010',
  100,
  '10000000-0000-0000-0000-000000000100',
  'Framing',
  'Structure'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select actual from budget_line_items where id = '10000000-0000-0000-0000-000000000100'),
  100::numeric,
  'expense insert reconciles the stored actual'
);

update expenses
set amount = 125
where id = '10000000-0000-0000-0000-000000001000';

select is(
  (select actual from budget_line_items where id = '10000000-0000-0000-0000-000000000100'),
  125::numeric,
  'expense update reconciles in the same transaction'
);

select throws_ok(
  $$update budget_line_items
    set actual = 999
    where id = '10000000-0000-0000-0000-000000000100'$$,
  '42501',
  'budget line item actual is derived and cannot be edited directly',
  'a client cannot overwrite a derived actual'
);

select lives_ok(
  $$update budget_line_items
    set actual = 125, budget = 1000
    where id = '10000000-0000-0000-0000-000000000100'$$,
  'a same-value legacy actual does not block another line-item edit'
);

insert into change_orders (
  id, project_id, title, amount, status, budget_line_item_id,
  budget_line_item_title, category_name
)
values (
  '10000000-0000-0000-0000-000000002000',
  '10000000-0000-0000-0000-000000000010',
  'Added blocking',
  50,
  'paid',
  '10000000-0000-0000-0000-000000000100',
  'Framing',
  'Structure'
);

select is(
  (select actual from budget_line_items where id = '10000000-0000-0000-0000-000000000100'),
  175::numeric,
  'a paid change order contributes to actual spend'
);

insert into expenses (
  id, project_id, amount, change_order_id, budget_line_item_id,
  budget_line_item_title, category_name
)
values (
  '10000000-0000-0000-0000-000000001001',
  '10000000-0000-0000-0000-000000000010',
  50,
  '10000000-0000-0000-0000-000000002000',
  '10000000-0000-0000-0000-000000000100',
  'Framing',
  'Structure'
);

select is(
  (select actual from budget_line_items where id = '10000000-0000-0000-0000-000000000100'),
  175::numeric,
  'an invoiced change order is not counted twice'
);

update budget_line_items
set is_allowance = true
where id = '10000000-0000-0000-0000-000000000100';

insert into allowance_selections (project_id, line_item_id, amount)
values (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000100',
  75
);

select is(
  (select actual from budget_line_items where id = '10000000-0000-0000-0000-000000000100'),
  75::numeric,
  'allowance selections authoritatively replace tied spend'
);

select throws_ok(
  $$insert into expenses (project_id, amount)
    values ('20000000-0000-0000-0000-000000000020', 10)$$,
  '42501',
  'project not found or access denied',
  'a financial row cannot point at another account project'
);

select throws_ok(
  $$insert into budget_line_items (project_id, title)
    values ('20000000-0000-0000-0000-000000000020', 'Foreign line')$$,
  '42501',
  'project not found or access denied',
  'a line item cannot point at another account project'
);

insert into vendors (id, project_id, name)
values (
  '10000000-0000-0000-0000-000000003000',
  '10000000-0000-0000-0000-000000000010',
  'Local vendor'
);

update expenses
set vendor_id = '10000000-0000-0000-0000-000000003000'
where id = '10000000-0000-0000-0000-000000001000';

select lives_ok(
  $$delete from vendors
    where id = '10000000-0000-0000-0000-000000003000'$$,
  'vendor purge safely nulls linked expenses'
);

select is(
  (select vendor_id from expenses where id = '10000000-0000-0000-0000-000000001000'),
  null::uuid,
  'vendor purge clears the stable expense link'
);

select lives_ok(
  $$delete from projects
    where id = '10000000-0000-0000-0000-000000000010'$$,
  'project purge safely cascades through financial rows'
);

select is(
  (select count(*) from budget_line_items where project_id = '10000000-0000-0000-0000-000000000010'),
  0::bigint,
  'project purge removes its line items'
);

select is(
  (select count(*) from expenses where project_id = '10000000-0000-0000-0000-000000000010'),
  0::bigint,
  'project purge removes its expenses'
);

select * from finish();

rollback;
