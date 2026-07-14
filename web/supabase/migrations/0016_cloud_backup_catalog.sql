-- Durable metadata for R2 project snapshots. The object bytes remain in R2, while
-- this catalog makes backups discoverable, downloadable, restorable, and subject
-- to a bounded retention policy instead of becoming anonymous orphan objects.
set search_path to buildtracker;

create table if not exists backup_catalog (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Intentionally not a foreign key: a recovery snapshot must remain discoverable
  -- even if its source project is later permanently deleted.
  project_id uuid not null,
  project_name text not null default '',
  object_key text not null,
  backup_version integer not null,
  size_bytes bigint not null default 0,
  checksum text not null default '',
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_backup_catalog_project
  on backup_catalog (project_id, created_at desc)
  where deleted_at is null;
create unique index if not exists uniq_backup_catalog_object_key
  on backup_catalog (object_key);

grant all on backup_catalog to authenticated, service_role;
revoke all on backup_catalog from anon;

alter table backup_catalog enable row level security;
create policy backup_catalog_sel on backup_catalog for select using (owner = (select auth.uid()));
create policy backup_catalog_ins on backup_catalog for insert with check (owner = (select auth.uid()));
create policy backup_catalog_upd on backup_catalog for update using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy backup_catalog_del on backup_catalog for delete using (owner = (select auth.uid()));

notify pgrst, 'reload schema';
