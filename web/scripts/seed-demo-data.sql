-- Demo spend data for the LOCAL stack only — makes the UI audit realistic.
-- Targets the seeded "New Home Construction" project for raj@local.test.
set search_path to buildtracker;

do $$
declare
  v_owner uuid;
  v_project uuid;
begin
  select id into v_owner from auth.users where email = 'raj@local.test';
  select id into v_project from projects where name = 'New Home Construction' and owner = v_owner;
  if v_project is null then raise exception 'project not found'; end if;

  -- idempotent: clear prior demo rows
  delete from expenses where project_id = v_project;
  delete from phases where project_id = v_project;
  delete from vendors where project_id = v_project;
  delete from change_orders where project_id = v_project;
  delete from project_tasks where project_id = v_project;
  delete from lien_waivers where project_id = v_project;

  insert into phases (owner, project_id, name, pct_complete, sort_order, target_date) values
    (v_owner, v_project, 'Pre-Construction', 100, 0, current_date - 240),
    (v_owner, v_project, 'Site Work', 100, 1, current_date - 200),
    (v_owner, v_project, 'Foundation', 100, 2, current_date - 150),
    (v_owner, v_project, 'Framing', 85, 3, current_date - 30),
    (v_owner, v_project, 'Roofing', 60, 4, current_date + 20),
    (v_owner, v_project, 'Rough-Ins (MEP)', 35, 5, current_date + 55),
    (v_owner, v_project, 'Insulation & Drywall', 0, 6, current_date + 90),
    (v_owner, v_project, 'Interior Finishes', 0, 7, current_date + 150);

  insert into vendors (owner, project_id, name, trade, phone, email, tax_id, license_number, insurance_expiry) values
    (v_owner, v_project, 'Hartwell Excavating', 'Excavation', '555-201-4480', 'office@hartwellexc.com', '82-1944302', 'EXC-20381', current_date + 180),
    (v_owner, v_project, 'Solid Rock Concrete', 'Concrete', '555-318-2206', 'bids@solidrockconcrete.com', '47-8812930', 'CON-11842', current_date + 90),
    (v_owner, v_project, 'Pine Ridge Framing', 'Framing', '555-440-9981', 'crew@pineridgeframing.com', '31-7702844', 'FRM-33019', current_date - 12),
    (v_owner, v_project, 'Summit Roofing Co', 'Roofing', '555-672-1133', 'hello@summitroofing.co', '', 'RFG-55260', current_date + 300),
    (v_owner, v_project, 'Volt Electric', 'Electrical', '555-883-7745', 'service@voltelectric.io', '90-3318467', 'ELE-90201', current_date + 240),
    (v_owner, v_project, 'Bluewater Plumbing', 'Plumbing', '555-904-5512', 'jobs@bluewaterplumb.com', '', '', null),
    (v_owner, v_project, 'Apex HVAC', 'HVAC', '555-119-8830', 'install@apexhvac.com', '64-2210573', 'HVA-71458', current_date + 60),
    (v_owner, v_project, 'Cedar & Stone Interiors', 'Finish Carpentry', '555-263-7741', 'studio@cedarandstone.com', '', '', null);

  -- expenses: tie to real seeded line items by fuzzy title match
  insert into expenses (owner, project_id, amount, amount_paid, vendor_name, invoice_number, date, due_date, paid_date, payment_method, category_name, room_tag, budget_line_item_id, budget_line_item_title, is_paid, funding_source, retainage_amount)
  select v_owner, v_project, e.amount, case when e.paid then e.amount - e.retainage else e.partial end, e.vendor, e.inv,
         current_date - e.age, case when e.due_in is null then null else current_date + e.due_in end,
         case when e.paid then current_date - e.age + 14 else null end,
         case when e.paid then 'check' else '' end,
         li.category_name, e.room, li.id, li.title, e.paid, e.fund, e.retainage
  from (values
    -- vendor, invoice, amount, age_days, paid, partial_paid, due_in_days, fund, retainage, room, title_match
    ('Hartwell Excavating',  'HX-1042', 38500.00, 235, true,  0, null, 'cash', 0,    '', '%xcavation%'),
    ('Hartwell Excavating',  'HX-1078', 12200.00, 210, true,  0, null, 'cash', 0,    '', '%rading%'),
    ('Solid Rock Concrete',  'SRC-220', 64800.00, 175, true,  0, null, 'loan', 3240, '', '%oundation%'),
    ('Solid Rock Concrete',  'SRC-241', 18400.00, 160, true,  0, null, 'loan', 0,    '', '%latwork%'),
    ('Pine Ridge Framing',   'PRF-310', 88000.00, 95,  true,  0, null, 'loan', 4400, '', '%raming labor%'),
    ('Pine Ridge Framing',   'PRF-322', 61500.00, 70,  true,  0, null, 'loan', 0,    '', '%umber%'),
    ('Pine Ridge Framing',   'PRF-339', 24600.00, 28,  false, 12300, 6, 'loan', 0,   '', '%heathing%'),
    ('Summit Roofing Co',    'SR-5501', 21800.00, 20,  false, 0,  10, 'loan', 1090,  '', '%oofing%'),
    ('Volt Electric',        'VE-883',  9800.00,  45,  true,  0, null, 'cash', 0,    '', '%lectrical rough%'),
    ('Bluewater Plumbing',   'BW-2210', 11400.00, 40,  true,  0, null, 'cash', 0,    '', '%lumbing rough%'),
    ('Apex HVAC',            'AX-9912', 14750.00, 12,  false, 0,  4,  'loan', 0,     '', '%HVAC%'),
    ('Cedar & Stone Interiors','CS-101', 6200.00, 8,   false, 0,  -3, 'cash', 0,     'kitchen', '%abinet%'),
    ('City of Lakeview',     'PERMIT-7', 8400.00, 240, true,  0, null, 'cash', 0,    '', '%ermit%'),
    ('Lakeview Surveying',   'LS-440',  2900.00,  238, true,  0, null, 'cash', 0,    '', '%urvey%'),
    ('Anderson Windows',     'AW-7733', 32400.00, 33,  true,  0, null, 'loan', 0,    '', '%indow%'),
    ('Gulf Lumber Supply',   'GL-2208', 7350.00,  55,  true,  0, null, 'cash', 0,    '', '%teel%')
  ) as e(vendor, inv, amount, age, paid, partial, due_in, fund, retainage, room, m)
  join lateral (
    select id, title, category_name from budget_line_items
    where project_id = v_project and deleted_at is null and title ilike e.m
    order by budget desc limit 1
  ) li on true;

  insert into change_orders (owner, project_id, title, amount, status, category_name, expected_payment_date) values
    (v_owner, v_project, 'Kitchen island upgrade — quartz waterfall', 12500, 'pending', 'Cabinetry & Countertops', current_date + 30),
    (v_owner, v_project, 'Upgrade to standing-seam metal roof section', 8400, 'approved', 'Roofing', current_date + 45),
    (v_owner, v_project, 'Rock clause — extra excavation day', 3600, 'paid', 'Site Work & Excavation', null);

  insert into project_tasks (owner, project_id, title, status, due_date, vendor_id) values
    (v_owner, v_project, 'Order windows — 6 week lead time', 'done', current_date - 40, null),
    (v_owner, v_project, 'Schedule framing inspection', 'inProgress', current_date + 3, (select id from vendors where project_id = v_project and name = 'Pine Ridge Framing')),
    (v_owner, v_project, 'Collect COI renewal from Pine Ridge Framing', 'todo', current_date + 7, (select id from vendors where project_id = v_project and name = 'Pine Ridge Framing')),
    (v_owner, v_project, 'Confirm HVAC duct layout for kitchen vent', 'blocked', current_date + 5, (select id from vendors where project_id = v_project and name = 'Apex HVAC')),
    (v_owner, v_project, 'Pick exterior stone sample', 'todo', current_date + 14, null),
    (v_owner, v_project, 'Approve roofing color', 'todo', current_date + 2, null);

  insert into lien_waivers (owner, project_id, vendor_name, amount, waiver_type, through_date, received)
  select v_owner, v_project, x.vendor, x.amount, x.wt, current_date - 30, x.rec from (values
    ('Hartwell Excavating', 50700.00, 'final', true),
    ('Solid Rock Concrete', 83200.00, 'conditional', true),
    ('Pine Ridge Framing', 149500.00, 'conditional', false)
  ) x(vendor, amount, wt, rec);

  -- denormalized actuals: app recalculates on write; mirror that here
  update budget_line_items li set actual = sub.total
  from (select budget_line_item_id, sum(amount) total from expenses
        where project_id = v_project and deleted_at is null group by budget_line_item_id) sub
  where li.id = sub.budget_line_item_id;

  -- a little committed spend so the dashboard committed tile is non-zero
  update budget_line_items set committed = actual + 18000
  where project_id = v_project and title ilike '%raming labor%';
end $$;
