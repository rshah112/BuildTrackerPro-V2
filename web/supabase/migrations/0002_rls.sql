-- Row-Level Security: every table is private to its owner. Without a session that
-- matches `owner`, the public Vercel URL returns nothing. Single-user app, so the
-- policy is uniform: owner = auth.uid() for read, and owner must equal auth.uid()
-- on any row written.

alter table projects enable row level security;
create policy projects_sel on projects for select using (owner = auth.uid());
create policy projects_ins on projects for insert with check (owner = auth.uid());
create policy projects_upd on projects for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy projects_del on projects for delete using (owner = auth.uid());

alter table budget_categories enable row level security;
create policy budget_categories_sel on budget_categories for select using (owner = auth.uid());
create policy budget_categories_ins on budget_categories for insert with check (owner = auth.uid());
create policy budget_categories_upd on budget_categories for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy budget_categories_del on budget_categories for delete using (owner = auth.uid());

alter table budget_line_items enable row level security;
create policy budget_line_items_sel on budget_line_items for select using (owner = auth.uid());
create policy budget_line_items_ins on budget_line_items for insert with check (owner = auth.uid());
create policy budget_line_items_upd on budget_line_items for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy budget_line_items_del on budget_line_items for delete using (owner = auth.uid());

alter table expenses enable row level security;
create policy expenses_sel on expenses for select using (owner = auth.uid());
create policy expenses_ins on expenses for insert with check (owner = auth.uid());
create policy expenses_upd on expenses for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy expenses_del on expenses for delete using (owner = auth.uid());

alter table vendors enable row level security;
create policy vendors_sel on vendors for select using (owner = auth.uid());
create policy vendors_ins on vendors for insert with check (owner = auth.uid());
create policy vendors_upd on vendors for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy vendors_del on vendors for delete using (owner = auth.uid());

alter table change_orders enable row level security;
create policy change_orders_sel on change_orders for select using (owner = auth.uid());
create policy change_orders_ins on change_orders for insert with check (owner = auth.uid());
create policy change_orders_upd on change_orders for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy change_orders_del on change_orders for delete using (owner = auth.uid());

alter table photo_attachments enable row level security;
create policy photo_attachments_sel on photo_attachments for select using (owner = auth.uid());
create policy photo_attachments_ins on photo_attachments for insert with check (owner = auth.uid());
create policy photo_attachments_upd on photo_attachments for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy photo_attachments_del on photo_attachments for delete using (owner = auth.uid());

alter table project_documents enable row level security;
create policy project_documents_sel on project_documents for select using (owner = auth.uid());
create policy project_documents_ins on project_documents for insert with check (owner = auth.uid());
create policy project_documents_upd on project_documents for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy project_documents_del on project_documents for delete using (owner = auth.uid());

alter table project_tasks enable row level security;
create policy project_tasks_sel on project_tasks for select using (owner = auth.uid());
create policy project_tasks_ins on project_tasks for insert with check (owner = auth.uid());
create policy project_tasks_upd on project_tasks for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy project_tasks_del on project_tasks for delete using (owner = auth.uid());

alter table bid_packages enable row level security;
create policy bid_packages_sel on bid_packages for select using (owner = auth.uid());
create policy bid_packages_ins on bid_packages for insert with check (owner = auth.uid());
create policy bid_packages_upd on bid_packages for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy bid_packages_del on bid_packages for delete using (owner = auth.uid());

alter table bids enable row level security;
create policy bids_sel on bids for select using (owner = auth.uid());
create policy bids_ins on bids for insert with check (owner = auth.uid());
create policy bids_upd on bids for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy bids_del on bids for delete using (owner = auth.uid());

alter table allowance_selections enable row level security;
create policy allowance_selections_sel on allowance_selections for select using (owner = auth.uid());
create policy allowance_selections_ins on allowance_selections for insert with check (owner = auth.uid());
create policy allowance_selections_upd on allowance_selections for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy allowance_selections_del on allowance_selections for delete using (owner = auth.uid());
