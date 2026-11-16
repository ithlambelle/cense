-- Created with Claude Code (2026-11-17). claim_auth_attempt()
-- (20261117120000_auth_throttle.sql): the per-email and per-IP limits on the
-- sign-in routes, and that only the service role can claim and nobody can read
-- or clear the count. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- Who can do what.
select ok(not has_function_privilege('anon', 'public.claim_auth_attempt(text, text, text)', 'execute'), 'anon cannot claim');
select ok(not has_function_privilege('authenticated', 'public.claim_auth_attempt(text, text, text)', 'execute'), 'students cannot claim');
select ok(has_function_privilege('service_role', 'public.claim_auth_attempt(text, text, text)', 'execute'), 'the app server can claim');
select ok(not has_table_privilege('anon', 'public.auth_throttle_events', 'select'), 'anon cannot read the count');
select ok(not has_table_privilege('authenticated', 'public.auth_throttle_events', 'delete'), 'students cannot clear it');
select ok(not has_table_privilege('service_role', 'public.auth_throttle_events', 'delete'), 'not even the server can clear it outside the function');
select ok(not has_table_privilege('anon', 'public.auth_throttle_events', 'truncate'), 'or empty it');

set local role service_role;

-- Five emails to one address, then a wait.
select is(array[
  public.claim_auth_attempt('send', 'ana@example.com', '203.0.113.7'),
  public.claim_auth_attempt('send', 'ana@example.com', '203.0.113.7'),
  public.claim_auth_attempt('send', 'Ana@Example.com ', '203.0.113.7'),
  public.claim_auth_attempt('send', 'ana@example.com', '203.0.113.7'),
  public.claim_auth_attempt('send', 'ana@example.com', '203.0.113.7')], array[0, 0, 0, 0, 0], 'five emails to one address go out (case and spaces do not matter)');
select ok(public.claim_auth_attempt('send', 'ANA@example.com', '198.51.100.1') between 1 and 600, 'the sixth waits, from any address');
select is(public.claim_auth_attempt('send', 'ben@example.com', '203.0.113.7'), 0, 'another email from the same address still goes out');
select is(public.claim_auth_attempt('verify', 'ana@example.com', '203.0.113.7'), 0, 'sending and checking are counted apart');

-- Ten code guesses on one email, then a wait.
select is((select array_agg(public.claim_auth_attempt('verify', 'cara@example.com', null)) from generate_series(1, 10)),
  array_fill(0, array[10]), 'ten code checks on one email go ahead');
select ok(public.claim_auth_attempt('verify', 'cara@example.com', null) > 0, 'the eleventh waits');
select is(public.claim_auth_attempt('password', 'cara@example.com', null), 0, 'password tries have their own count');

-- A refused try is not counted, and the wait is until the oldest counted try is 10 minutes old.
reset role;
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'send:email', sha256(convert_to('dana@example.com', 'UTF8')), now() - interval '4 minutes' from generate_series(1, 5);
-- Older than the window: neither counted nor kept.
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'send:email', sha256(convert_to('eli@example.com', 'UTF8')), now() - interval '11 minutes' from generate_series(1, 5);
set local role service_role;
select is(public.claim_auth_attempt('send', 'dana@example.com', null), 360, 'the wait ends when the oldest try is 10 minutes old');
select is(public.claim_auth_attempt('send', 'eli@example.com', null), 0, 'tries older than 10 minutes do not count');
reset role;
select is((select count(*)::integer from public.auth_throttle_events where at <= now() - interval '10 minutes'), 0, 'and are deleted');
select is((select count(*)::integer from public.auth_throttle_events where key_hash = sha256(convert_to('dana@example.com', 'UTF8'))), 5, 'the refused try was not counted');

-- One campus address: 300 emails in 10 minutes (any addresses), 600 checks.
insert into public.auth_throttle_events (bucket, key_hash)
  select 'send:ip', sha256(convert_to('192.0.2.50', 'UTF8')) from generate_series(1, 299);
insert into public.auth_throttle_events (bucket, key_hash)
  select 'check:ip', sha256(convert_to('192.0.2.50', 'UTF8')) from generate_series(1, 600);
set local role service_role;
select is(public.claim_auth_attempt('send', 'fay@example.com', '192.0.2.50'), 0, 'the 300th email from one address goes out');
select ok(public.claim_auth_attempt('send', 'gus@example.com', '192.0.2.50') > 0, 'the 301st waits');
select ok(public.claim_auth_attempt('link', null, '192.0.2.50') > 0, 'past 600 checks, opening a reset link waits too');

select throws_ok($$ select public.claim_auth_attempt('anything', 'ana@example.com', null) $$, '22023', null, 'an unknown action is refused');

select * from finish();
rollback;
