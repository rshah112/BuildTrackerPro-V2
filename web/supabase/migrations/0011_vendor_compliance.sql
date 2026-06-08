-- Vendor compliance fields for subcontractor management: W-9 tax id (1099 prep), license number,
-- and certificate-of-insurance expiry (COI tracking + expiry warnings). Additive + nullable/
-- defaulted, buildtracker schema only — the existing RLS + grants on `vendors` cover the new
-- columns (RLS is table-wide, not per-column). Applied to prod 2026-06-08 via the Management API.
set search_path to buildtracker;

alter table vendors add column if not exists tax_id text not null default '';
alter table vendors add column if not exists license_number text not null default '';
alter table vendors add column if not exists insurance_expiry date;

notify pgrst, 'reload schema';
