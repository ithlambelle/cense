-- Created with Claude Code (2026-11-17). claim_auth_attempt()
-- (20261117120000_auth_throttle.sql): the tight limits per email and IP, the
-- looser per-email and per-IP ceilings, the daily cap on code checks, email
-- normalization, and that nobody can read or clear the count. One
-- transaction, rolled back. Since 2026-11-21 the app's server counts tries
-- with claim_auth_attempt_hashed() instead (keyed_auth_throttle.test.sql), so
-- the service role can no longer call this one and these checks run as its
-- owner.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(35);

-- Who can do what.
select ok(not has_function_privilege('anon', 'public.claim_auth_attempt(text, text, text)', 'execute'), 'anon cannot claim');
select ok(not has_function_privilege('authenticated', 'public.claim_auth_attempt(text, text, text)', 'execute'), 'students cannot claim');
select ok(not has_function_privilege('service_role', 'public.claim_auth_attempt(text, text, text)', 'execute'), 'the app server no longer calls the unkeyed claim');
select ok(not has_table_privilege('anon', 'public.auth_throttle_events', 'select'), 'anon cannot read the count');
select ok(not has_table_privilege('authenticated', 'public.auth_throttle_events', 'delete'), 'students cannot clear it');
select ok(not has_table_privilege('service_role', 'public.auth_throttle_events', 'delete'), 'not even the server can clear it outside the function');
select ok(not has_table_privilege('anon', 'public.auth_throttle_events', 'truncate'), 'or empty it');
select ok((select proconfig from pg_proc where oid = 'public.claim_auth_attempt(text, text, text)'::regprocedure) @> array['lock_timeout=2s'],
  'a claim waits at most 2 seconds for a lock');

-- How an email is counted.
select is(public.auth_throttle_email(' Ana+Promo@Example.COM '), 'ana@example.com', 'lowercased, trimmed, +tag dropped');
select is(public.auth_throttle_email('ana@example.com'), 'ana@example.com', 'a plain email is unchanged');
select is(public.auth_throttle_email(''), null, 'an empty email is no email');


-- Five emails from one address to one email, then a wait, for that address only.
select is(array[
  public.claim_auth_attempt('send', 'ana@example.com', '203.0.113.7'),
  public.claim_auth_attempt('send', 'ana+1@example.com', '203.0.113.7'),
  public.claim_auth_attempt('send', 'Ana+2@Example.com ', '203.0.113.7'),
  public.claim_auth_attempt('send', 'ana@example.com', '203.0.113.7'),
  public.claim_auth_attempt('send', 'ana@example.com', '203.0.113.7')], array[0, 0, 0, 0, 0], 'five emails to one address go out (+tags and case share a count)');
select ok(public.claim_auth_attempt('send', 'ana+3@example.com', '203.0.113.7') between 1 and 600, 'the sixth from that address waits');
select is(public.claim_auth_attempt('send', 'ana@example.com', '198.51.100.1'), 0, 'the student, from their own address, is not locked out');
select is(public.claim_auth_attempt('send', 'ben@example.com', '203.0.113.7'), 0, 'another email from the same address still goes out');
select is(public.claim_auth_attempt('verify', 'ana@example.com', '203.0.113.7'), 0, 'sending and checking are counted apart');

-- Ten code guesses from one address, then a wait there; the student still gets in.
select is((select array_agg(public.claim_auth_attempt('verify', 'cara@example.com', '203.0.113.9')) from generate_series(1, 10)),
  array_fill(0, array[10]), 'ten code checks on one email from one address go ahead');
select ok(public.claim_auth_attempt('verify', 'cara@example.com', '203.0.113.9') > 0, 'the eleventh from that address waits');
select is(public.claim_auth_attempt('verify', 'cara@example.com', '198.51.100.2'), 0, 'the student checking their own code from elsewhere is not locked out');
select is(public.claim_auth_attempt('password', 'cara@example.com', '203.0.113.9'), 0, 'password tries have their own count');

-- Without a known IP (off Vercel) the email + IP limits apply to the email alone.
select is((select array_agg(public.claim_auth_attempt('send', 'dev@example.com', null)) from generate_series(1, 5)),
  array_fill(0, array[5]), 'with no IP, five emails go out');
select ok(public.claim_auth_attempt('send', 'dev@example.com', null) > 0, 'and the sixth waits');

-- The looser per-email ceilings, reached from many addresses.
reset role;
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'send:email', sha256(convert_to('dana@example.com', 'UTF8')), now() - interval '4 minutes' from generate_series(1, 30);
insert into public.auth_throttle_events (bucket, key_hash)
  select 'password:email', sha256(convert_to('dana@example.com', 'UTF8')) from generate_series(1, 50);
select is(public.claim_auth_attempt('send', 'dana@example.com', '192.0.2.10'), 360, 'past 30 emails to one email in 10 minutes, any address waits until the oldest is 10 minutes old');
select ok(public.claim_auth_attempt('password', 'Dana+x@example.com', '192.0.2.11') > 0, 'past 50 password tries on one email, any address waits');
reset role;
select is((select count(*)::integer from public.auth_throttle_events where key_hash = sha256(convert_to('dana@example.com', 'UTF8')) and bucket = 'send:email'), 30, 'a refused try is not counted');

-- The daily cap on code checks: 20 per email and address, 50 per email.
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'verify:email_ip:day', sha256(convert_to('eli@example.com|192.0.2.20', 'UTF8')), now() - interval '5 hours' from generate_series(1, 20);
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'verify:email:day', sha256(convert_to('fay@example.com', 'UTF8')), now() - interval '2 hours' from generate_series(1, 50);
select is(public.claim_auth_attempt('verify', 'eli@example.com', '192.0.2.20'), 68400, 'past 20 checks a day from one address, it waits until the oldest is a day old');
select is(public.claim_auth_attempt('verify', 'eli@example.com', '192.0.2.21'), 0, 'from another address the email still has checks left');
select is(public.claim_auth_attempt('verify', 'fay@example.com', '192.0.2.22'), 79200, 'past 50 checks on one email in a day, every address waits');

-- Old rows: not counted, and deleted; a day's code checks are kept for the day.
reset role;
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'send:email_ip', sha256(convert_to('gus@example.com|', 'UTF8')), now() - interval '11 minutes' from generate_series(1, 5);
select is(public.claim_auth_attempt('send', 'gus@example.com', null), 0, 'tries older than 10 minutes do not count');
reset role;
select is((select count(*)::integer from public.auth_throttle_events where at <= now() - interval '10 minutes' and bucket not like '%:day'), 0, 'and are deleted');
select is((select count(*)::integer from public.auth_throttle_events where bucket = 'verify:email_ip:day' and at <= now() - interval '10 minutes'), 20, 'a day''s code checks are kept');

-- One campus address: 300 emails in 10 minutes (any emails), 600 checks.
insert into public.auth_throttle_events (bucket, key_hash)
  select 'send:ip', sha256(convert_to('192.0.2.50', 'UTF8')) from generate_series(1, 299);
insert into public.auth_throttle_events (bucket, key_hash)
  select 'check:ip', sha256(convert_to('192.0.2.50', 'UTF8')) from generate_series(1, 600);
select is(public.claim_auth_attempt('send', 'hal@example.com', '192.0.2.50'), 0, 'the 300th email from one address goes out');
select ok(public.claim_auth_attempt('send', 'ivy@example.com', '192.0.2.50') > 0, 'the 301st waits');
select ok(public.claim_auth_attempt('link', null, '192.0.2.50') > 0, 'past 600 checks, opening a reset link waits too');

select throws_ok($$ select public.claim_auth_attempt('anything', 'ana@example.com', null) $$, '22023', null, 'an unknown action is refused');

select * from finish();
rollback;
