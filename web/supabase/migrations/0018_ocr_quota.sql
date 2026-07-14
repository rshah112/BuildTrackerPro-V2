-- OCR provider spend is enforced in Postgres so concurrent Vercel instances share one
-- atomic per-account budget. Clients cannot read or write counters directly; the only
-- authenticated entry point consumes one request for auth.uid().

create table buildtracker.ocr_quota_usage (
  owner uuid primary key references auth.users (id) on delete cascade,
  minute_started_at timestamptz not null,
  minute_count integer not null default 0 check (minute_count >= 0),
  day_started_on date not null,
  day_count integer not null default 0 check (day_count >= 0),
  day_bytes bigint not null default 0 check (day_bytes >= 0),
  updated_at timestamptz not null default now()
);

alter table buildtracker.ocr_quota_usage enable row level security;

-- 0003 grants broad defaults to newly-created buildtracker tables. This internal
-- accounting table is intentionally narrower: only its SECURITY DEFINER function
-- may touch it on behalf of an authenticated account.
revoke all on table buildtracker.ocr_quota_usage from public, anon, authenticated;
grant all on table buildtracker.ocr_quota_usage to service_role;

create or replace function buildtracker.consume_ocr_quota(
  p_input_bytes bigint,
  p_per_minute integer,
  p_per_day integer,
  p_daily_bytes bigint
)
returns table (
  ok boolean,
  reason text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_day date := (v_now at time zone 'UTC')::date;
  v_usage buildtracker.ocr_quota_usage%rowtype;
  v_retry integer;
begin
  if v_owner is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Match the hard bounds in api/ocr.ts. Keeping absolute ceilings here prevents a
  -- caller from using this RPC as an unbounded counter or overflowing arithmetic.
  if p_input_bytes is null or p_per_minute is null or p_per_day is null or p_daily_bytes is null
    or p_input_bytes < 1 or p_input_bytes > 4000000
    or p_per_minute < 1 or p_per_minute > 60
    or p_per_day < 1 or p_per_day > 1000
    or p_daily_bytes < 1000000 or p_daily_bytes > 1000000000 then
    raise exception 'invalid OCR quota parameters' using errcode = '22023';
  end if;

  -- Serialize only this account. The lock also closes the first-insert race while
  -- allowing different accounts to consume their budgets concurrently.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 180318));

  select usage.*
  into v_usage
  from buildtracker.ocr_quota_usage as usage
  where usage.owner = v_owner
  for update;

  if not found then
    insert into buildtracker.ocr_quota_usage (
      owner, minute_started_at, minute_count, day_started_on, day_count, day_bytes, updated_at
    ) values (
      v_owner, v_now, 0, v_day, 0, 0, v_now
    )
    returning * into v_usage;
  end if;

  if v_usage.day_started_on <> v_day then
    v_usage.day_started_on := v_day;
    v_usage.day_count := 0;
    v_usage.day_bytes := 0;
    v_usage.minute_started_at := v_now;
    v_usage.minute_count := 0;
  elsif v_now - v_usage.minute_started_at >= interval '1 minute' then
    v_usage.minute_started_at := v_now;
    v_usage.minute_count := 0;
  end if;

  if v_usage.minute_count >= p_per_minute then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (v_usage.minute_started_at + interval '1 minute' - v_now)))::integer
    );
    return query select false, 'minute'::text, v_retry;
    return;
  end if;

  v_retry := greatest(
    1,
    ceil(extract(epoch from ((((v_day + 1)::timestamp) at time zone 'UTC') - v_now)))::integer
  );
  if v_usage.day_count >= p_per_day then
    return query select false, 'day'::text, v_retry;
    return;
  end if;
  if v_usage.day_bytes + p_input_bytes > p_daily_bytes then
    return query select false, 'bytes'::text, v_retry;
    return;
  end if;

  update buildtracker.ocr_quota_usage
  set minute_started_at = v_usage.minute_started_at,
      minute_count = v_usage.minute_count + 1,
      day_started_on = v_usage.day_started_on,
      day_count = v_usage.day_count + 1,
      day_bytes = v_usage.day_bytes + p_input_bytes,
      updated_at = v_now
  where owner = v_owner;

  return query select true, null::text, null::integer;
end;
$$;

revoke all on function buildtracker.consume_ocr_quota(bigint, integer, integer, bigint) from public, anon;
grant execute on function buildtracker.consume_ocr_quota(bigint, integer, integer, bigint) to authenticated, service_role;
