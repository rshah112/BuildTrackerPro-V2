-- Lien waiver tracking: one row per waiver collected from a vendor for a payment, by type
-- (conditional/unconditional × progress/final) and the "through" date the waiver covers. Owner-
-- scoped RLS + soft-delete like every other table; buildtracker schema only. Applied to prod
-- 2026-06-08 via the Management API.
set search_path to buildtracker;

create table if not exists lien_waivers (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  vendor_name text not null default '',
  expense_id uuid references expenses (id),
  amount numeric not null default 0,
  waiver_type text not null default 'conditional_progress',
  through_date date,
  received boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_lien_waivers_project on lien_waivers (project_id) where deleted_at is null;

grant all on lien_waivers to anon, authenticated, service_role;

alter table lien_waivers enable row level security;
create policy lien_waivers_sel on lien_waivers for select using (owner = (select auth.uid()));
create policy lien_waivers_ins on lien_waivers for insert with check (owner = (select auth.uid()));
create policy lien_waivers_upd on lien_waivers for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy lien_waivers_del on lien_waivers for delete using (owner = (select auth.uid()));

notify pgrst, 'reload schema';
