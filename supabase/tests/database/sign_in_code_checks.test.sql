-- Created with Claude Code (2026-11-26). auth_code_check()
-- (20261126150100_sign_in_code_checks.sql): a code dies after 5 checks until
-- a new one is sent, a new code clears only the checks made before its send
-- began, only wrong codes count against an IP (60 per 10 minutes, no daily
-- cap), and who may call it. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(29);

-- Earlier local sign-ins leave records; this test counts only its own.
delete from public.auth_throttle_events;

-- A stand-in for the app's HMAC: any 64-character hex string is a key here.
create function pg_temp.k(p text) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to('test-key|' || p, 'UTF8'), 'sha256'), 'hex');
$$;
grant execute on function pg_temp.k(text) to service_role;
-- Counts this test's rows; runs as the table's owner, since the service role
-- cannot read the table (only the function can).
create function pg_temp.rows(p_bucket text, p_key text) returns integer language sql security definer as $$
  select count(*)::integer from public.auth_throttle_events
  where bucket like p_bucket and (p_key is null or key_hash = decode(p_key, 'hex'));
$$;
grant execute on function pg_temp.rows(text, text) to service_role;
-- A room of students on one address, each with the right code.
create function pg_temp.room(p_ip text, p_students integer) returns integer language plpgsql as $$
declare
  v_in integer := 0;
begin
  for n in 1 .. p_students loop
    if public.auth_code_check('claim', pg_temp.k('room' || n), pg_temp.k(p_ip), null) = 0 then
      v_in := v_in + 1;
      perform public.auth_code_check('give_back', null, pg_temp.k(p_ip), null);
    end if;
  end loop;
  return v_in;
end;
$$;
grant execute on function pg_temp.room(text, integer) to service_role;

-- Who can do what.
select ok(not has_function_privilege('anon', 'public.auth_code_check(text, text, text, integer)', 'execute'), 'anon cannot claim a code check');
select ok(not has_function_privilege('authenticated', 'public.auth_code_check(text, text, text, integer)', 'execute'), 'students cannot either');
select ok(has_function_privilege('service_role', 'public.auth_code_check(text, text, text, integer)', 'execute'), 'the app server can');
select ok((select proconfig from pg_proc where oid = 'public.auth_code_check(text, text, text, integer)'::regprocedure) @> array['lock_timeout=2s', 'search_path=""'],
  'it waits at most 2 seconds for a lock, with an empty search path');

set local role service_role;

select throws_ok($$ select public.auth_code_check('claim', 'ana@example.com', null, null) $$, '22023', null, 'an email in place of a key is refused');
select throws_ok($$ select public.auth_code_check('anything', pg_temp.k('ana'), null, null) $$, '22023', null, 'an unknown step is refused');

-- Five checks of one code, then that code is dead, whatever the address.
select is((select array_agg(public.auth_code_check('claim', pg_temp.k('ana'), null, null)) from generate_series(1, 5)),
  array_fill(0, array[5]), 'five checks of a code go ahead');
select is(public.auth_code_check('claim', pg_temp.k('ana'), null, null), -1, 'the sixth is told to ask for a new code');
select is(public.auth_code_check('claim', pg_temp.k('ana'), pg_temp.k('198.51.100.1'), null), -1, 'from another address too');
select is(public.auth_code_check('claim', pg_temp.k('ben'), null, null), 0, 'another email is not affected');
select is(pg_temp.rows('code:email:day', null), 6, 'refused checks take no place');

-- A new code clears the email's count, and only that email's. Every row in
-- this one transaction has the same time, so ana's checks are moved a minute
-- back to be older than the send.
reset role;
update public.auth_throttle_events set at = at - interval '1 minute' where key_hash = decode(pg_temp.k('ana'), 'hex');
set local role service_role;
select is(public.auth_code_check('new_code', pg_temp.k('ana'), null, 0), 0, 'a new code is sent');
select is((select array_agg(public.auth_code_check('claim', pg_temp.k('ana'), null, null)) from generate_series(1, 5)),
  array_fill(0, array[5]), 'the new code gets five checks');
select is(public.auth_code_check('claim', pg_temp.k('ana'), null, null), -1, 'and then dies too');
select is(pg_temp.rows('code:email:day', pg_temp.k('ben')), 1, 'the other email kept its count');

-- Checks made after the send began, or up to a second before it, stay
-- counted against the new code.
reset role;
insert into public.auth_throttle_events (bucket, key_hash, at)
  select 'code:email:day', decode(pg_temp.k('cara'), 'hex'), now() - interval '10 seconds' from generate_series(1, 3)
  union all
  select 'code:email:day', decode(pg_temp.k('cara'), 'hex'), now() - interval '5.5 seconds' from generate_series(1, 2);
set local role service_role;
select is(public.auth_code_check('new_code', pg_temp.k('cara'), null, 5000), 0, 'a code whose send began 5 seconds ago');
select is(pg_temp.rows('code:email:day', pg_temp.k('cara')), 2, 'clears the 3 older checks and keeps the 2 made half a second before the send');
select is((select array_agg(public.auth_code_check('claim', pg_temp.k('cara'), null, null)) from generate_series(1, 4)),
  array[0, 0, 0, -1], 'so the new code has 3 checks left, not 5');

-- One address: 60 wrong codes across many emails, then a wait; no daily cap.
select is((select array_agg(public.auth_code_check('claim', pg_temp.k('spray' || n), pg_temp.k('203.0.113.7'), null)) from generate_series(1, 60) as n),
  array_fill(0, array[60]), 'sixty checks from one address, each on a different email');
select ok(public.auth_code_check('claim', pg_temp.k('spray61'), pg_temp.k('203.0.113.7'), null) between 1 and 600, 'the next waits at most 10 minutes, for any email');
select is(pg_temp.rows('code:ip:day', null), 0, 'and nothing is counted by the day');

-- A right code gives its own place back, so a room signing in together is never stopped.
select is(pg_temp.room('192.0.2.9', 80), 80, 'eighty students on one address, each with the right code, all go ahead');
select is(pg_temp.rows('code:ip%', pg_temp.k('192.0.2.9')), 0, 'and leave no wrong-code count on that address');

-- A check Supabase never made (its own rate limit) gives back both places.
select is(public.auth_code_check('claim', pg_temp.k('dev'), pg_temp.k('198.51.100.9'), null), 0, 'a check takes a place');
select is(public.auth_code_check('give_back', pg_temp.k('dev'), pg_temp.k('198.51.100.9'), null), 0, 'and gives it back');
select is(pg_temp.rows('code:email:day', pg_temp.k('dev')) + pg_temp.rows('code:ip', pg_temp.k('198.51.100.9')), 0, 'leaving no email or IP place taken');
select throws_ok($$ select public.auth_code_check('passed', null, pg_temp.k('198.51.100.9'), null) $$, '22023', null, 'the old step name is gone');

reset role;
-- Round 1's three-argument function is dropped, not left beside this one.
select is(to_regprocedure('public.auth_code_check(text, text, text)'), null, 'no three-argument auth_code_check is left');
select ok(to_regprocedure('public.auth_code_check(text, text, text, integer)') is not null, 'the four-argument one is there');
select * from finish();
rollback;
