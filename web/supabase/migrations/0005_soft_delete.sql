-- #2 Soft-delete / Trash for child entities (PROPOSED — NOT YET APPLIED).
--
-- Adds a nullable `deleted_at` to every child table (projects already has one). The app
-- treats `deleted_at IS NULL` as "active"; setting it = trash; clearing it = restore;
-- a hard DELETE = "delete forever". Additive + nullable, so existing/old clients keep
-- working (they just ignore the new column). buildtracker schema only — does NOT touch
-- the Smart_Home_Hub `public` schema. Apply BEFORE deploying the client that filters on
-- it (the column must exist before queries reference it).

set search_path to buildtracker;

alter table budget_categories     add column if not exists deleted_at timestamptz;
alter table budget_line_items     add column if not exists deleted_at timestamptz;
alter table expenses              add column if not exists deleted_at timestamptz;
alter table vendors               add column if not exists deleted_at timestamptz;
alter table change_orders         add column if not exists deleted_at timestamptz;
alter table photo_attachments     add column if not exists deleted_at timestamptz;
alter table project_documents     add column if not exists deleted_at timestamptz;
alter table project_tasks         add column if not exists deleted_at timestamptz;
alter table bid_packages          add column if not exists deleted_at timestamptz;
alter table bids                  add column if not exists deleted_at timestamptz;
alter table allowance_selections  add column if not exists deleted_at timestamptz;

-- Partial indexes keep the common "active rows for this project" read fast as trash
-- accumulates (the hot path filters project_id + deleted_at IS NULL).
create index if not exists idx_expenses_active          on expenses (project_id)          where deleted_at is null;
create index if not exists idx_budget_line_items_active on budget_line_items (project_id) where deleted_at is null;
create index if not exists idx_change_orders_active     on change_orders (project_id)     where deleted_at is null;
create index if not exists idx_project_tasks_active     on project_tasks (project_id)     where deleted_at is null;
