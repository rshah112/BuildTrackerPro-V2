begin;

set local search_path = buildtracker, extensions, public;

select plan(13);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ocr-minute@test.invalid', now(), now()),
  ('82000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ocr-day@test.invalid', now(), now()),
  ('83000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ocr-bytes@test.invalid', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select ok from consume_ocr_quota(10, 2, 10, 1000000)),
  true,
  'the first request consumes the shared quota'
);
select is(
  (select ok from consume_ocr_quota(10, 2, 10, 1000000)),
  true,
  'a request below the minute limit is accepted'
);
select is(
  (select reason from consume_ocr_quota(10, 2, 10, 1000000)),
  'minute'::text,
  'the atomic minute counter rejects the next request'
);
select cmp_ok(
  (select retry_after_seconds from consume_ocr_quota(10, 2, 10, 1000000)),
  '>=',
  1,
  'a minute rejection includes a retry delay'
);

select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is((select ok from consume_ocr_quota(10, 10, 2, 1000000)), true, 'daily request one is accepted');
select is((select ok from consume_ocr_quota(10, 10, 2, 1000000)), true, 'daily request two is accepted');
select is(
  (select reason from consume_ocr_quota(10, 10, 2, 1000000)),
  'day'::text,
  'the shared daily request limit is enforced'
);

select set_config('request.jwt.claim.sub', '83000000-0000-0000-0000-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"83000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select ok from consume_ocr_quota(700000, 10, 10, 1000000)),
  true,
  'input bytes are charged atomically'
);
select is(
  (select reason from consume_ocr_quota(400000, 10, 10, 1000000)),
  'bytes'::text,
  'the shared daily byte budget is enforced'
);

select throws_ok(
  $$select * from consume_ocr_quota(0, 10, 10, 1000000)$$,
  '22023',
  'invalid OCR quota parameters',
  'invalid byte counts fail closed'
);
select throws_ok(
  $$select * from consume_ocr_quota(null, 10, 10, 1000000)$$,
  '22023',
  'invalid OCR quota parameters',
  'null quota inputs fail closed'
);
select throws_ok(
  $$select * from ocr_quota_usage$$,
  '42501',
  'permission denied for table ocr_quota_usage',
  'authenticated clients cannot inspect quota accounting'
);

reset role;
select is(
  (select count(*) from buildtracker.ocr_quota_usage),
  3::bigint,
  'one private accounting row is maintained per account'
);

select * from finish();

rollback;
