-- D1 / advisor `auth_rls_initplan`: wrap auth.uid() in a scalar subselect so Postgres
-- evaluates it ONCE per query (as an InitPlan) instead of re-running the auth function
-- for every candidate row. Behavior is identical — `owner = (select auth.uid())` is the
-- same predicate — but it stops being re-evaluated per row, which matters as tables grow.
--
-- Pure ALTER POLICY rewrites (no drop/recreate), so this is safe to run against an
-- existing database and leaves policy names untouched.
--
-- NOTE: this targets the SHARED Smart_Home_Hub project. Apply via the normal migration
-- path (local: `supabase db reset` / `supabase migration up`; remote: review + apply),
-- then refresh advisors. Not auto-applied.

set search_path to buildtracker;

alter policy projects_sel on projects using (owner = (select auth.uid()));
alter policy projects_ins on projects with check (owner = (select auth.uid()));
alter policy projects_upd on projects using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy projects_del on projects using (owner = (select auth.uid()));

alter policy budget_categories_sel on budget_categories using (owner = (select auth.uid()));
alter policy budget_categories_ins on budget_categories with check (owner = (select auth.uid()));
alter policy budget_categories_upd on budget_categories using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy budget_categories_del on budget_categories using (owner = (select auth.uid()));

alter policy budget_line_items_sel on budget_line_items using (owner = (select auth.uid()));
alter policy budget_line_items_ins on budget_line_items with check (owner = (select auth.uid()));
alter policy budget_line_items_upd on budget_line_items using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy budget_line_items_del on budget_line_items using (owner = (select auth.uid()));

alter policy expenses_sel on expenses using (owner = (select auth.uid()));
alter policy expenses_ins on expenses with check (owner = (select auth.uid()));
alter policy expenses_upd on expenses using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy expenses_del on expenses using (owner = (select auth.uid()));

alter policy vendors_sel on vendors using (owner = (select auth.uid()));
alter policy vendors_ins on vendors with check (owner = (select auth.uid()));
alter policy vendors_upd on vendors using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy vendors_del on vendors using (owner = (select auth.uid()));

alter policy change_orders_sel on change_orders using (owner = (select auth.uid()));
alter policy change_orders_ins on change_orders with check (owner = (select auth.uid()));
alter policy change_orders_upd on change_orders using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy change_orders_del on change_orders using (owner = (select auth.uid()));

alter policy photo_attachments_sel on photo_attachments using (owner = (select auth.uid()));
alter policy photo_attachments_ins on photo_attachments with check (owner = (select auth.uid()));
alter policy photo_attachments_upd on photo_attachments using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy photo_attachments_del on photo_attachments using (owner = (select auth.uid()));

alter policy project_documents_sel on project_documents using (owner = (select auth.uid()));
alter policy project_documents_ins on project_documents with check (owner = (select auth.uid()));
alter policy project_documents_upd on project_documents using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy project_documents_del on project_documents using (owner = (select auth.uid()));

alter policy project_tasks_sel on project_tasks using (owner = (select auth.uid()));
alter policy project_tasks_ins on project_tasks with check (owner = (select auth.uid()));
alter policy project_tasks_upd on project_tasks using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy project_tasks_del on project_tasks using (owner = (select auth.uid()));

alter policy bid_packages_sel on bid_packages using (owner = (select auth.uid()));
alter policy bid_packages_ins on bid_packages with check (owner = (select auth.uid()));
alter policy bid_packages_upd on bid_packages using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy bid_packages_del on bid_packages using (owner = (select auth.uid()));

alter policy bids_sel on bids using (owner = (select auth.uid()));
alter policy bids_ins on bids with check (owner = (select auth.uid()));
alter policy bids_upd on bids using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy bids_del on bids using (owner = (select auth.uid()));

alter policy allowance_selections_sel on allowance_selections using (owner = (select auth.uid()));
alter policy allowance_selections_ins on allowance_selections with check (owner = (select auth.uid()));
alter policy allowance_selections_upd on allowance_selections using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
alter policy allowance_selections_del on allowance_selections using (owner = (select auth.uid()));
