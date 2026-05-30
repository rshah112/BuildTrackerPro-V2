-- API role privileges for the buildtracker schema. PostgREST only exposes a schema
-- whose tables the request roles can touch; RLS (0002) still restricts which rows.
-- Mirrors what Supabase grants on `public` by default.

grant usage on schema buildtracker to anon, authenticated, service_role;

grant all on all tables in schema buildtracker to anon, authenticated, service_role;
grant all on all sequences in schema buildtracker to anon, authenticated, service_role;
grant all on all functions in schema buildtracker to anon, authenticated, service_role;

-- Anything created later in this schema inherits the same grants.
alter default privileges in schema buildtracker
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema buildtracker
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema buildtracker
  grant all on functions to anon, authenticated, service_role;
