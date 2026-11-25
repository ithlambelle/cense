-- Created with Claude Code (2026-11-19). purge_old_quota_rows() after
-- 20261119090000_purge_auth_attempts.sql: it deletes sign-in attempt records
-- older than a day as well as limit counts older than two days, keeps
-- everything newer, leaves the sign-in, Penny and email limits working, and
-- only the service role may run it. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

-- Start from nothing (rolled back with the rest), so rows from other local
-- runs cannot change the counts.
delete from public.penny_asks;
delete from public.confirmation_email_sends;
delete from public.auth_throttle_events;

-- Who may run it ---------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.purge_old_quota_rows()', 'execute'), 'anon cannot run the purge');
select ok(not has_function_privilege('authenticated', 'public.purge_old_quota_rows()', 'execute'), 'nor can a signed-in student');
select ok(has_function_privilege('service_role', 'public.purge_old_quota_rows()', 'execute'), 'the service role (the daily cron) can');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.purge_old_quota_rows()'::regprocedure),
  'it runs as its owner, with an empty search_path');
select ok((select p.proowner = c.relowner from pg_proc p, pg_class c
    where p.oid = 'public.purge_old_quota_rows()'::regprocedure and c.oid = 'public.auth_throttle_events'::regclass),
  'its owner owns the sign-in table, so row level security there hides nothing from it');

set local role anon;
select throws_ok($$ select public.purge_old_quota_rows() $$, '42501', null, 'anon calling it directly is refused');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ select public.purge_old_quota_rows() $$, '42501', null, 'so is a signed-in student');
reset role;

-- What it deletes --------------------------------------------------------------

-- Sign-in attempt records older than a day: 22.
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'verify:email_ip:day', sha256(convert_to('lee@example.com|192.0.2.31', 'UTF8')), now() - interval '25 hours' from generate_series(1, 20);
insert into public.auth_throttle_events (bucket, key_hash, at) values
  ('send:email_ip', sha256(convert_to('mo@example.com|192.0.2.32', 'UTF8')), now() - interval '25 hours'),
  ('check:ip', sha256(convert_to('192.0.2.33', 'UTF8')), now() - interval '30 days');
-- Younger than a day: 22, kept. kai has used up a day's code checks from one
-- address, so those rows must stay to keep counting.
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'verify:email_ip:day', sha256(convert_to('kai@example.com|192.0.2.30', 'UTF8')), now() - interval '23 hours' from generate_series(1, 20);
insert into public.auth_throttle_events (bucket, key_hash, at) values
  ('send:email', sha256(convert_to('mo@example.com', 'UTF8')), now() - interval '23 hours'),
  ('check:ip', sha256(convert_to('192.0.2.33', 'UTF8')), now() - interval '1 minute');
-- Limit counts older than two days: 3. Younger: 2, kept.
insert into public.penny_asks (student_id, asked_at) values
  ('f5000000-0000-4000-8000-000000000002', now() - interval '3 days'),
  ('f5000000-0000-4000-8000-000000000002', now() - interval '3 days'),
  ('f5000000-0000-4000-8000-000000000002', now() - interval '47 hours');
insert into public.confirmation_email_sends (student_id, sent_at) values
  ('f5000000-0000-4000-8000-000000000002', now() - interval '3 days'),
  ('f5000000-0000-4000-8000-000000000002', now() - interval '1 hour');

set local role service_role;
select is(public.purge_old_quota_rows(), 25,
  'as the cron runs it, it deletes the 22 sign-in records older than a day and the 3 limit counts older than two days, and returns the total');
reset role;
select is((select count(*)::int from public.auth_throttle_events where at < now() - interval '1 day'), 0,
  'no sign-in attempt record older than a day is left');
select is((select count(*)::int from public.auth_throttle_events), 22,
  'every one younger than a day stays');
select is((select count(*)::int from public.penny_asks where asked_at < now() - interval '2 days')
  + (select count(*)::int from public.confirmation_email_sends where sent_at < now() - interval '2 days'), 0,
  'no limit count older than two days is left');
select is((select count(*)::int from public.penny_asks) + (select count(*)::int from public.confirmation_email_sends), 2,
  'and the limit counts younger than two days stay');
set local role service_role;
select is(public.purge_old_quota_rows(), 0, 'running it again deletes nothing more');

-- The limits still work --------------------------------------------------------
-- Through claim_auth_attempt_hashed(), as the app's server calls it since
-- 20261121210000_keyed_auth_throttle.sql. The keys here are plain SHA-256s in
-- hex, the same bytes as the rows inserted above; the app sends HMACs, which
-- this function cannot tell apart and does not need to.

select is(public.claim_auth_attempt_hashed('verify', encode(sha256(convert_to('kai@example.com|192.0.2.30', 'UTF8')), 'hex'), encode(sha256(convert_to('kai@example.com', 'UTF8')), 'hex'), encode(sha256(convert_to('192.0.2.30', 'UTF8')), 'hex')), 3600,
  'the daily cap on code checks still counts the last 24 hours: kai waits until the oldest is a day old');
select is(public.claim_auth_attempt_hashed('verify', encode(sha256(convert_to('lee@example.com|192.0.2.31', 'UTF8')), 'hex'), encode(sha256(convert_to('lee@example.com', 'UTF8')), 'hex'), encode(sha256(convert_to('192.0.2.31', 'UTF8')), 'hex')), 0,
  'lee''s checks from over a day ago were deleted, and did not count anyway');
select is(public.claim_auth_attempt_hashed('send', encode(sha256(convert_to('nia@example.com|192.0.2.40', 'UTF8')), 'hex'), encode(sha256(convert_to('nia@example.com', 'UTF8')), 'hex'), encode(sha256(convert_to('192.0.2.40', 'UTF8')), 'hex')), 0, 'a new sign-in email goes ahead');
reset role;
select is((select count(*)::int from public.auth_throttle_events where at = now()), 7,
  'tries after the purge are counted as before (4 for lee''s check, 3 for nia''s email; kai''s refused try is not)');
set local role service_role;
select is(public.claim_penny_ask('f5000000-0000-4000-8000-000000000003'), 'ok', 'a typed Penny question is still claimed');
select is(public.claim_confirmation_email('f5000000-0000-4000-8000-000000000003'), true, 'and so is a confirmation email');
reset role;

select * from finish();
rollback;
