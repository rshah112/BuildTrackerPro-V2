-- Web Push subscriptions (Phase 2 background reminders). One row per browser/device push
-- endpoint, owner-scoped via RLS. The reminder cron (service role) reads these to send.
-- Additive; buildtracker schema only — never touches public (Home Hub).

set search_path to buildtracker;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_owner on push_subscriptions (owner);

grant all on push_subscriptions to anon, authenticated, service_role;

alter table push_subscriptions enable row level security;

create policy push_subscriptions_sel on push_subscriptions for select using (owner = (select auth.uid()));
create policy push_subscriptions_ins on push_subscriptions for insert with check (owner = (select auth.uid()));
create policy push_subscriptions_upd on push_subscriptions for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy push_subscriptions_del on push_subscriptions for delete using (owner = (select auth.uid()));

notify pgrst, 'reload schema';
