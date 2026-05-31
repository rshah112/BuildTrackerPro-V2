-- Per-owner reminder preferences read by the push-reminders cron (server-side) and edited
-- from the Reminder settings screen. One row per owner. Additive; buildtracker schema only.

set search_path to buildtracker;

create table if not exists notification_prefs (
  owner uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  lead_days integer not null default 3 check (lead_days between 0 and 30),
  quiet_start integer not null default 21 check (quiet_start between 0 and 23),
  quiet_end integer not null default 7 check (quiet_end between 0 and 23),
  remind_due_soon boolean not null default true,
  remind_overdue boolean not null default true,
  remind_change_orders boolean not null default true,
  updated_at timestamptz not null default now()
);

grant all on notification_prefs to anon, authenticated, service_role;

alter table notification_prefs enable row level security;

create policy notification_prefs_sel on notification_prefs for select using (owner = (select auth.uid()));
create policy notification_prefs_ins on notification_prefs for insert with check (owner = (select auth.uid()));
create policy notification_prefs_upd on notification_prefs for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy notification_prefs_del on notification_prefs for delete using (owner = (select auth.uid()));

notify pgrst, 'reload schema';
