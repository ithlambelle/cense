-- Created with Claude Code (2026-11-26). auth_code_check()
-- (20261126140000_sign_in_code_checks.sql): a code dies after 5 checks until
-- a new one is sent, only wrong codes count against an IP, and who may call
-- it. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(21);

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
    if public.auth_code_check('claim', pg_temp.k('room' || n), pg_temp.k(p_ip)) = 0 then
      v_in := v_in + 1;
      perform public.auth_code_check('passed', null, pg_temp.k(p_ip));
    end if;
  end loop;
  return v_in;
end;
$$;
grant execute on function pg_temp.room(text, integer) to service_role;


-- Who can do what.
select ok(not has_function_privilege('anon', 'public.auth_code_check(text, text, text)', 'execute'), 'anon cannot claim a code check');
select ok(not has_function_privilege('authenticated', 'public.auth_code_check(text, text, text)', 'execute'), 'students cannot either');
select ok(has_function_privilege('service_role', 'public.auth_code_check(text, text, text)', 'execute'), 'the app server can');
select ok((select proconfig from pg_proc where oid = 'public.auth_code_check(text, text, text)'::regprocedure) @> array['lock_timeout=2s', 'search_path=""'],
  'it waits at most 2 seconds for a lock, with an empty search path');

set local role service_role;

select throws_ok($$ select public.auth_code_check('claim', 'ana@example.com', null) $$, '22023', null, 'an email in place of a key is refused');
select throws_ok($$ select public.auth_code_check('anything', pg_temp.k('ana'), null) $$, '22023', null, 'an unknown step is refused');

-- Five checks of one code, then that code is dead, whatever the address.
select is((select array_agg(public.auth_code_check('claim', pg_temp.k('ana'), null)) from generate_series(1, 5)),
  array_fill(0, array[5]), 'five checks of a code go ahead');
select is(public.auth_code_check('claim', pg_temp.k('ana'), null), -1, 'the sixth is told to ask for a new code');
select is(public.auth_code_check('claim', pg_temp.k('ana'), pg_temp.k('198.51.100.1')), -1, 'from another address too');
select is(public.auth_code_check('claim', pg_temp.k('ben'), null), 0, 'another email is not affected');
select is(pg_temp.rows('code:email:day', null), 6, 'refused checks take no place');

-- A new code clears the email's count, and only that email's.
select is(public.auth_code_check('new_code', pg_temp.k('ana'), null), 0, 'a new code is sent');
select is((select array_agg(public.auth_code_check('claim', pg_temp.k('ana'), null)) from generate_series(1, 5)),
  array_fill(0, array[5]), 'the new code gets five checks');
select is(public.auth_code_check('claim', pg_temp.k('ana'), null), -1, 'and then dies too');
select is(pg_temp.rows('code:email:day', null), 6, 'the other email kept its count');

-- One address: 30 wrong codes across many emails, then a wait.
select is((select array_agg(public.auth_code_check('claim', pg_temp.k('spray' || n), pg_temp.k('203.0.113.7'))) from generate_series(1, 30) as n),
  array_fill(0, array[30]), 'thirty checks from one address, each on a different email');
select ok(public.auth_code_check('claim', pg_temp.k('spray31'), pg_temp.k('203.0.113.7')) between 1 and 600, 'the next waits, for any email');

-- A right code gives its own place back, so a room signing in together is never stopped.
select is(pg_temp.room('192.0.2.9', 40), 40, 'forty students on one address, each with the right code, all go ahead');
select is(pg_temp.rows('code:ip%', pg_temp.k('192.0.2.9')), 0,
  'and leave no wrong-code count on that address');

-- Giving a place back on an address with none changes nothing anywhere else.
select is(public.auth_code_check('passed', null, pg_temp.k('192.0.2.9')), 0, 'a right code with no place to give back');
select is(pg_temp.rows('code:ip', pg_temp.k('203.0.113.7')), 30,
  'leaves the other address at its thirty');

reset role;
select * from finish();
rollback;
