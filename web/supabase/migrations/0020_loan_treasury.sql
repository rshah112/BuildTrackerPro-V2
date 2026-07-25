-- Construction-loan treasury: loan terms, draw lifecycle, and the disbursement ledger that
-- traces draw cash out to the parties who fronted the work.
--
-- ACCOUNTING RULE THIS MIGRATION EXISTS TO ENFORCE STRUCTURALLY:
-- a reimbursement is a CASH movement, never a project COST. Budget actuals are derived by
-- calculated_line_item_actual() (0017) from `expenses` and paid `change_orders` ONLY. The two
-- tables added here are deliberately absent from that function and carry no reconcile trigger,
-- so no row in them can ever reach budget_line_items.actual, category spend, EAC, or cash flow.
-- Repaying yourself $6,500 for the architect leaves the project's cost at $6,500, not $13,000.
--
-- Additive only; buildtracker schema only (public is a different app). Owner-scoped RLS with
-- WITH CHECK and soft delete, matching every other table.

set search_path to buildtracker;

-- ---------------------------------------------------------------------------
-- Loan terms. The loan is interest-only; these columns describe the facility
-- itself so carrying cost over the full term can be projected, not just accrued.
-- ---------------------------------------------------------------------------
alter table construction_loans add column if not exists start_date date;
alter table construction_loans add column if not exists term_months integer not null default 0;
-- Stored rather than derived: lenders routinely set maturity to something other than
-- start + term (holiday/business-day conventions, negotiated extensions).
alter table construction_loans add column if not exists maturity_date date;
alter table construction_loans add column if not exists origination_fee numeric not null default 0;
-- 0 = lender holds no interest reserve, so interest is paid from leftover draw cash or personally.
alter table construction_loans add column if not exists interest_reserve_amount numeric not null default 0;
alter table construction_loans add column if not exists interest_basis text not null default 'actual/365';

alter table construction_loans drop constraint if exists construction_loans_term_months_check;
alter table construction_loans add constraint construction_loans_term_months_check
  check (term_months >= 0 and term_months <= 600);

alter table construction_loans drop constraint if exists construction_loans_interest_basis_check;
alter table construction_loans add constraint construction_loans_interest_basis_check
  check (interest_basis in ('actual/365', '30/360'));

-- ---------------------------------------------------------------------------
-- Draw lifecycle: requested -> approved -> funded. Only a FUNDED draw has moved
-- money, so only funded draws add to the loan balance, accrue interest, consume
-- the facility, or can be disbursed from. Existing rows default to 'funded' so
-- today's balances are unchanged by this migration.
-- ---------------------------------------------------------------------------
alter table loan_draws add column if not exists status text not null default 'funded';
alter table loan_draws add column if not exists requested_date date;
alter table loan_draws add column if not exists approved_date date;
-- Lender fees netted out of the wire: principal added to the balance is `amount`,
-- but cash that actually lands in the account is amount - fees_amount.
alter table loan_draws add column if not exists fees_amount numeric not null default 0;
alter table loan_draws add column if not exists inspection_date date;
alter table loan_draws add column if not exists inspection_status text not null default '';
alter table loan_draws add column if not exists inspector_name text not null default '';

alter table loan_draws drop constraint if exists loan_draws_status_check;
alter table loan_draws add constraint loan_draws_status_check
  check (status in ('requested', 'approved', 'funded'));

alter table loan_draws drop constraint if exists loan_draws_inspection_status_check;
alter table loan_draws add constraint loan_draws_inspection_status_check
  check (inspection_status in ('', 'not_required', 'scheduled', 'passed', 'failed'));

alter table loan_draws drop constraint if exists loan_draws_fees_nonnegative;
alter table loan_draws add constraint loan_draws_fees_nonnegative check (fees_amount >= 0);

create index if not exists idx_loan_draws_status on loan_draws (project_id, status) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- draw_disbursements — cash leaving a funded draw toward one party.
--
-- party_type is WHO RECEIVED the money, which is the dimension the schema was
-- missing: 'self' repays Raj for what he fronted, 'builder' makes the builder
-- whole, 'vendor' pays a sub directly out of draw cash.
-- ---------------------------------------------------------------------------
create table if not exists draw_disbursements (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id),
  project_id uuid not null references projects (id),
  draw_id uuid not null references loan_draws (id),
  party_type text not null default 'self',
  -- Set only for party_type = 'vendor'; party_name stays the display snapshot for all types.
  vendor_id uuid references vendors (id),
  party_name text not null default '',
  amount numeric not null default 0,
  disbursed_date date not null default current_date,
  payment_method text not null default '',
  payment_reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint draw_disbursements_party_type_check check (party_type in ('self', 'builder', 'vendor')),
  constraint draw_disbursements_vendor_required check (party_type <> 'vendor' or vendor_id is not null),
  constraint draw_disbursements_amount_nonnegative check (amount >= 0)
);
create index if not exists idx_draw_disbursements_project on draw_disbursements (project_id);
create index if not exists idx_draw_disbursements_draw on draw_disbursements (draw_id) where deleted_at is null;
create index if not exists idx_draw_disbursements_vendor on draw_disbursements (vendor_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- disbursement_allocations — optional line-level tracing of a disbursement back
-- to the expenses it settled. A real reimbursement is often one lump sum backed
-- by a receipt list, so the header carries the cash and allocations explain it.
--
-- Allocations may be partial and may be incomplete: the unallocated remainder of
-- a disbursement is float/advance against future costs, not an error. Crucially,
-- an allocation carries NO category and NO line item — which is why a
-- reimbursement spanning several budget categories is arithmetically a non-event.
-- ---------------------------------------------------------------------------
create table if not exists disbursement_allocations (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id),
  project_id uuid not null references projects (id),
  disbursement_id uuid not null references draw_disbursements (id),
  expense_id uuid not null references expenses (id),
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint disbursement_allocations_amount_nonnegative check (amount >= 0)
);
create index if not exists idx_disbursement_allocations_project on disbursement_allocations (project_id);
create index if not exists idx_disbursement_allocations_disbursement
  on disbursement_allocations (disbursement_id) where deleted_at is null;
create index if not exists idx_disbursement_allocations_expense
  on disbursement_allocations (expense_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Integrity guards. You cannot disburse cash a draw never delivered, and you
-- cannot reimburse a party more than they actually laid out.
-- ---------------------------------------------------------------------------

-- Cash a funded draw actually delivered to the account: principal less lender fees.
create or replace function draw_net_funded(target_draw uuid)
returns numeric
language sql
stable
security invoker
set search_path = buildtracker, pg_temp
as $$
  select case when draw.status = 'funded' then greatest(0, draw.amount - draw.fees_amount) else 0 end
  from loan_draws draw
  where draw.id = target_draw and draw.deleted_at is null;
$$;

create or replace function draw_disbursed_total(target_draw uuid)
returns numeric
language sql
stable
security invoker
set search_path = buildtracker, pg_temp
as $$
  select coalesce(sum(disbursement.amount), 0)
  from draw_disbursements disbursement
  where disbursement.draw_id = target_draw and disbursement.deleted_at is null;
$$;

-- Mirrors lib/expenseMath.effectiveAmountPaid exactly: nothing is owed on a bill
-- that was never paid, and amount_paid is clamped to [0, amount].
create or replace function expense_effective_paid(target_expense uuid)
returns numeric
language sql
stable
security invoker
set search_path = buildtracker, pg_temp
as $$
  select case
    when expense.is_paid then least(expense.amount, greatest(0, expense.amount_paid))
    else 0
  end
  from expenses expense
  where expense.id = target_expense and expense.deleted_at is null;
$$;

create or replace function guard_draw_disbursement()
returns trigger
language plpgsql
volatile
security invoker
set search_path = buildtracker, pg_temp
as $$
declare
  parent_draw loan_draws;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select * into parent_draw from loan_draws where id = new.draw_id and deleted_at is null;
  if parent_draw is null then
    raise exception 'disbursement references a missing or deleted draw' using errcode = '23503';
  end if;
  if parent_draw.project_id <> new.project_id then
    raise exception 'disbursement and draw belong to different projects' using errcode = '23514';
  end if;
  if parent_draw.status <> 'funded' then
    raise exception 'cannot disburse cash from a draw that is not funded yet'
      using errcode = '23514';
  end if;

  if round(draw_disbursed_total(new.draw_id), 2) > round(draw_net_funded(new.draw_id), 2) then
    raise exception 'disbursements exceed the cash this draw delivered (% available)',
      draw_net_funded(new.draw_id) using errcode = '23514';
  end if;

  -- Shrinking a disbursement must not strand allocations above its new amount.
  if round(coalesce((
    select sum(allocation.amount) from disbursement_allocations allocation
    where allocation.disbursement_id = new.id and allocation.deleted_at is null
  ), 0), 2) > round(new.amount, 2) then
    raise exception 'allocations exceed this disbursement amount' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function guard_disbursement_allocation()
returns trigger
language plpgsql
volatile
security invoker
set search_path = buildtracker, pg_temp
as $$
declare
  parent_disbursement draw_disbursements;
  allocated_to_expense numeric;
  reimbursable numeric;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select * into parent_disbursement
  from draw_disbursements where id = new.disbursement_id and deleted_at is null;
  if parent_disbursement is null then
    raise exception 'allocation references a missing or deleted disbursement' using errcode = '23503';
  end if;
  if parent_disbursement.project_id <> new.project_id then
    raise exception 'allocation and disbursement belong to different projects' using errcode = '23514';
  end if;
  if not exists (
    select 1 from expenses
    where id = new.expense_id and project_id = new.project_id and deleted_at is null
  ) then
    raise exception 'allocation references a missing or cross-project expense' using errcode = '23503';
  end if;

  if round(coalesce((
    select sum(allocation.amount) from disbursement_allocations allocation
    where allocation.disbursement_id = new.disbursement_id and allocation.deleted_at is null
  ), 0), 2) > round(parent_disbursement.amount, 2) then
    raise exception 'allocations exceed this disbursement amount' using errcode = '23514';
  end if;

  -- An expense can only be settled up to the cash that was actually laid out for it.
  select coalesce(sum(allocation.amount), 0) into allocated_to_expense
  from disbursement_allocations allocation
  where allocation.expense_id = new.expense_id and allocation.deleted_at is null;
  reimbursable := expense_effective_paid(new.expense_id);
  if round(allocated_to_expense, 2) > round(coalesce(reimbursable, 0), 2) then
    raise exception 'allocations against this expense exceed the % actually paid out', coalesce(reimbursable, 0)
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Reducing a draw, charging fees against it, or walking its status back out of
-- 'funded' must not leave disbursements drawing on cash that no longer exists.
create or replace function guard_loan_draw_cash()
returns trigger
language plpgsql
volatile
security invoker
set search_path = buildtracker, pg_temp
as $$
begin
  if new.deleted_at is not null then
    if exists (
      select 1 from draw_disbursements
      where draw_id = new.id and deleted_at is null
    ) then
      raise exception 'delete this draw''s disbursements before trashing the draw'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if round(draw_disbursed_total(new.id), 2) > round(draw_net_funded(new.id), 2) then
    raise exception 'existing disbursements exceed the cash this draw would deliver'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists draw_disbursements_guard on draw_disbursements;
create trigger draw_disbursements_guard
after insert or update on draw_disbursements
for each row execute function guard_draw_disbursement();

drop trigger if exists disbursement_allocations_guard on disbursement_allocations;
create trigger disbursement_allocations_guard
after insert or update on disbursement_allocations
for each row execute function guard_disbursement_allocation();

drop trigger if exists loan_draws_guard_cash on loan_draws;
create trigger loan_draws_guard_cash
after update of amount, fees_amount, status, deleted_at on loan_draws
for each row execute function guard_loan_draw_cash();

-- ---------------------------------------------------------------------------
-- Grants + RLS (mirrors 0003/0006; PostgREST needs table privileges, RLS scopes rows).
-- ---------------------------------------------------------------------------
grant all on draw_disbursements, disbursement_allocations to anon, authenticated, service_role;

alter table draw_disbursements enable row level security;
drop policy if exists draw_disbursements_sel on draw_disbursements;
create policy draw_disbursements_sel on draw_disbursements for select using (owner = (select auth.uid()));
drop policy if exists draw_disbursements_ins on draw_disbursements;
create policy draw_disbursements_ins on draw_disbursements for insert with check (owner = (select auth.uid()));
drop policy if exists draw_disbursements_upd on draw_disbursements;
create policy draw_disbursements_upd on draw_disbursements for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists draw_disbursements_del on draw_disbursements;
create policy draw_disbursements_del on draw_disbursements for delete using (owner = (select auth.uid()));

alter table disbursement_allocations enable row level security;
drop policy if exists disbursement_allocations_sel on disbursement_allocations;
create policy disbursement_allocations_sel on disbursement_allocations for select using (owner = (select auth.uid()));
drop policy if exists disbursement_allocations_ins on disbursement_allocations;
create policy disbursement_allocations_ins on disbursement_allocations for insert with check (owner = (select auth.uid()));
drop policy if exists disbursement_allocations_upd on disbursement_allocations;
create policy disbursement_allocations_upd on disbursement_allocations for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists disbursement_allocations_del on disbursement_allocations;
create policy disbursement_allocations_del on disbursement_allocations for delete using (owner = (select auth.uid()));

revoke all on function draw_net_funded(uuid) from public, anon;
revoke all on function draw_disbursed_total(uuid) from public, anon;
revoke all on function expense_effective_paid(uuid) from public, anon;
revoke all on function guard_draw_disbursement() from public, anon;
revoke all on function guard_disbursement_allocation() from public, anon;
revoke all on function guard_loan_draw_cash() from public, anon;
revoke execute on function guard_draw_disbursement() from authenticated;
revoke execute on function guard_disbursement_allocation() from authenticated;
revoke execute on function guard_loan_draw_cash() from authenticated;
grant execute on function draw_net_funded(uuid) to authenticated, service_role;
grant execute on function draw_disbursed_total(uuid) to authenticated, service_role;
grant execute on function expense_effective_paid(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
