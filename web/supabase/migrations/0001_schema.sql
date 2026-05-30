-- BuildTrackerPro PWA — schema for all 12 entities.
-- Mirrors ParamusBuild/Models/*.swift. Money is numeric(14,2). Every row is owned
-- by a single auth user (RLS added in 0002). Child rows cascade-delete with their
-- project, matching the native permanentlyDelete cascade. Loose UUID references
-- (budget_line_item_id, vendor_id, package_id, line_item_id, awarded_bid_id) are
-- intentionally NOT foreign keys — native resolves them in app code with title
-- fallbacks, so we keep them as plain columns.
--
-- Everything lives in a dedicated `buildtracker` schema so this app can share a
-- Supabase project with others (e.g. Smart_Home_Hub's `public`) without colliding.
-- `set search_path` keeps the table DDL below unqualified; auth.* stays explicit.

create schema if not exists buildtracker;
set search_path to buildtracker;

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  address text not null default '',
  status text not null default 'planning' check (status in ('planning','active','paused','complete')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  template_type text not null default 'custom' check (template_type in (
    'customHome','majorRenovation','addition','poolBackyard','deckPatio','kitchenRemodel',
    'bathroomRemodel','basementFinish','garageBuild','landscapingHardscape','custom')),
  purchase_price numeric(14,2) not null default 0,
  square_footage double precision,
  lot_dimensions text not null default '',
  proposed_build_dimensions text not null default '',
  footprint text not null default '',
  stories integer not null default 0,
  basement text not null default '',
  scope_summary text not null default '',
  warranty_notes text not null default '',
  start_date timestamptz,
  target_finish_date timestamptz,
  construction_budget numeric(14,2) not null default 0,
  contingency_budget numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  target_budget numeric(14,2) not null default 0,
  system_image text not null default ''
);

create table budget_line_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  cost_code text not null default '',
  title text not null,
  category_name text not null default '',
  room_tag text not null default '',
  budget numeric(14,2) not null default 0,
  actual numeric(14,2) not null default 0,
  committed numeric(14,2) not null default 0,
  notes text not null default '',
  is_pinned boolean not null default false,
  is_allowance boolean not null default false,
  allowance_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  amount numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  vendor_name text not null default '',
  invoice_number text not null default '',
  date timestamptz not null default now(),
  due_date timestamptz,
  expected_payment_date timestamptz,
  paid_date timestamptz,
  payment_method text not null default '',
  payment_reference text not null default '',
  category_name text not null default '',
  room_tag text not null default '',
  budget_line_item_id uuid,
  budget_line_item_title text not null default '',
  notes text not null default '',
  is_paid boolean not null default true,
  receipt_object_key text
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  trade text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default ''
);

create table change_orders (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','paid')),
  notes text not null default '',
  category_name text not null default '',
  budget_line_item_id uuid,
  budget_line_item_title text not null default '',
  created_at timestamptz not null default now(),
  expected_payment_date timestamptz
);

create table photo_attachments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  image_object_key text,
  created_at timestamptz not null default now(),
  room_tag text not null default '',
  phase_tag text not null default '',
  category_name text not null default '',
  budget_line_item_id uuid,
  notes text not null default ''
);

create table project_documents (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  file_name text not null default '',
  kind text not null default 'other' check (kind in (
    'survey','approvals','plans','inspections','contractsInsurance','receiptsWarranties','other')),
  status text not null default 'received' check (status in ('required','received','missing')),
  notes text not null default '',
  budget_line_item_id uuid,
  budget_line_item_title text not null default '',
  uploaded_at timestamptz not null default now(),
  file_object_key text
);

create table project_tasks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo','inProgress','blocked','done')),
  due_date timestamptz,
  vendor_id uuid,
  budget_line_item_id uuid,
  photo_ids uuid[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table bid_packages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  scope_title text not null,
  due_date timestamptz,
  status text not null default 'open' check (status in ('open','awarded','passed')),
  awarded_bid_id uuid,
  created_at timestamptz not null default now(),
  notes text not null default ''
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  package_id uuid not null,
  vendor_id uuid,
  vendor_name text not null default '',
  amount numeric(14,2) not null default 0,
  file_object_key text,
  file_name text not null default '',
  notes text not null default '',
  line_items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  awarded_at timestamptz
);

create table allowance_selections (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  line_item_id uuid not null,
  selection_date timestamptz not null default now(),
  vendor text not null default '',
  amount numeric(14,2) not null default 0,
  notes text not null default '',
  photo_object_key text
);

-- Indexes: every child table is queried by project_id; all tables filter by owner (RLS).
create index idx_budget_categories_project on budget_categories (project_id);
create index idx_budget_line_items_project on budget_line_items (project_id);
create index idx_expenses_project on expenses (project_id);
create index idx_vendors_project on vendors (project_id);
create index idx_change_orders_project on change_orders (project_id);
create index idx_photo_attachments_project on photo_attachments (project_id);
create index idx_project_documents_project on project_documents (project_id);
create index idx_project_tasks_project on project_tasks (project_id);
create index idx_bid_packages_project on bid_packages (project_id);
create index idx_bids_project on bids (project_id);
create index idx_allowance_selections_project on allowance_selections (project_id);
create index idx_projects_owner on projects (owner);
