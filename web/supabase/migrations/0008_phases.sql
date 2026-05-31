-- Build-phase tracking ("Phase Pulse"): an ordered list of construction phases per project,
-- each with a 0–100% completion. Powers the dashboard Phase Pulse card and the /phases screen.
-- Additive; buildtracker schema only — never touches public (Home Hub).

set search_path to buildtracker;

create table if not exists phases (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null default '',
  pct_complete integer not null default 0 check (pct_complete >= 0 and pct_complete <= 100),
  sort_order integer not null default 0,
  target_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_phases_project on phases (project_id) where deleted_at is null;

grant all on phases to anon, authenticated, service_role;

alter table phases enable row level security;

create policy phases_sel on phases for select using (owner = (select auth.uid()));
create policy phases_ins on phases for insert with check (owner = (select auth.uid()));
create policy phases_upd on phases for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy phases_del on phases for delete using (owner = (select auth.uid()));

notify pgrst, 'reload schema';
