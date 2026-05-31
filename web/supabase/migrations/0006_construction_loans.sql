-- Construction loan tracking (optional, per project). A project may have ONE loan
-- (total amount + annual interest-only rate) and many draws against it. Same owner-scoped
-- RLS + soft-delete (deleted_at) as every other table. buildtracker schema only.

set search_path to buildtracker;

create table if not exists construction_loans (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id),
  project_id uuid not null references projects (id),
  lender text not null default '',
  total_amount numeric not null default 0,
  interest_rate numeric not null default 0, -- annual %, interest-only
  notes text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- At most one active loan per project.
create unique index if not exists uniq_construction_loans_project on construction_loans (project_id) where deleted_at is null;
create index if not exists idx_construction_loans_project on construction_loans (project_id);

create table if not exists loan_draws (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id),
  project_id uuid not null references projects (id),
  loan_id uuid not null references construction_loans (id),
  amount numeric not null default 0,
  draw_date timestamptz not null default now(),
  description text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_loan_draws_project on loan_draws (project_id);
create index if not exists idx_loan_draws_loan on loan_draws (loan_id);
create index if not exists idx_loan_draws_active on loan_draws (project_id) where deleted_at is null;

-- Grants (mirror 0003; PostgREST needs table privileges, RLS still scopes rows).
grant all on construction_loans, loan_draws to anon, authenticated, service_role;

-- RLS: private to the owner (uses the (select auth.uid()) InitPlan form, matching 0004).
alter table construction_loans enable row level security;
create policy construction_loans_sel on construction_loans for select using (owner = (select auth.uid()));
create policy construction_loans_ins on construction_loans for insert with check (owner = (select auth.uid()));
create policy construction_loans_upd on construction_loans for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy construction_loans_del on construction_loans for delete using (owner = (select auth.uid()));

alter table loan_draws enable row level security;
create policy loan_draws_sel on loan_draws for select using (owner = (select auth.uid()));
create policy loan_draws_ins on loan_draws for insert with check (owner = (select auth.uid()));
create policy loan_draws_upd on loan_draws for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy loan_draws_del on loan_draws for delete using (owner = (select auth.uid()));

-- Expose the new tables to the API.
notify pgrst, 'reload schema';
