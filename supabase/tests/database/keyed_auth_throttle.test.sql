-- Created with Claude Code (2026-11-21). claim_auth_attempt_hashed()
-- (20261121210000_keyed_auth_throttle.sql): the app's server sends keys it
-- computed with a secret (HMAC-SHA256), and the database stores exactly those
-- and never an email or IP. Who may call it, which keys it accepts, and that
-- the limits work as before. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

-- A stand-in for the app's HMAC: any 64-character hex string is a key here.
create function pg_temp.k(p text) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to('test-key|' || p, 'UTF8'), 'sha256'), 'hex');
$$;
grant execute on function pg_temp.k(text) to service_role;

-- Who can do what.
select ok(not has_function_privilege('anon', 'public.claim_auth_attempt_hashed(text, text, text, text)', 'execute'), 'anon cannot claim');
select ok(not has_function_privilege('authenticated', 'public.claim_auth_attempt_hashed(text, text, text, text)', 'execute'), 'students cannot claim');
select ok(has_function_privilege('service_role', 'public.claim_auth_attempt_hashed(text, text, text, text)', 'execute'), 'the app server can claim');
select ok(not has_function_privilege('service_role', 'public.claim_auth_attempt(text, text, text)', 'execute'), 'and can no longer use the unkeyed claim');
select ok((select proconfig from pg_proc where oid = 'public.claim_auth_attempt_hashed(text, text, text, text)'::regprocedure) @> array['lock_timeout=2s', 'search_path=""'],
  'a claim waits at most 2 seconds for a lock, with an empty search path');
select is((select count(*)::integer from public.auth_throttle_events), 0, 'no unkeyed record is left after the retire step');

set local role service_role;

-- Only ready-made keys are accepted: never an email, never half a pair.
select throws_ok($$ select public.claim_auth_attempt_hashed('send', 'ana@example.com', pg_temp.k('ana'), null) $$, '22023', null, 'an email in place of a key is refused');
select throws_ok($$ select public.claim_auth_attempt_hashed('send', upper(pg_temp.k('x')), pg_temp.k('ana'), null) $$, '22023', null, 'a key must be lowercase hex');
select throws_ok($$ select public.claim_auth_attempt_hashed('send', pg_temp.k('x'), null, null) $$, '22023', null, 'both email keys or neither');
select throws_ok($$ select public.claim_auth_attempt_hashed('anything', null, null, pg_temp.k('ip')) $$, '22023', null, 'an unknown action is refused');

-- Five emails from one address to one email, then a wait, for that address only.
select is((select array_agg(public.claim_auth_attempt_hashed('send', pg_temp.k('ana|203.0.113.7'), pg_temp.k('ana'), pg_temp.k('203.0.113.7'))) from generate_series(1, 5)),
  array_fill(0, array[5]), 'five emails go out');
select ok(public.claim_auth_attempt_hashed('send', pg_temp.k('ana|203.0.113.7'), pg_temp.k('ana'), pg_temp.k('203.0.113.7')) between 1 and 600, 'the sixth from that address waits');
select is(public.claim_auth_attempt_hashed('send', pg_temp.k('ana|198.51.100.1'), pg_temp.k('ana'), pg_temp.k('198.51.100.1')), 0, 'the student, from their own address, is not locked out');

-- Ten code guesses, then a wait; with no IP the email + IP limits apply to the email alone.
select is((select array_agg(public.claim_auth_attempt_hashed('verify', pg_temp.k('cara|'), pg_temp.k('cara'), null)) from generate_series(1, 10)),
  array_fill(0, array[10]), 'ten code checks with no IP go ahead');
select ok(public.claim_auth_attempt_hashed('verify', pg_temp.k('cara|'), pg_temp.k('cara'), null) > 0, 'the eleventh waits');

reset role;
-- What is stored is exactly the keys the server sent: no email, no IP.
select is_empty(
  $$select key_hash from public.auth_throttle_events
    except select decode(k, 'hex') from unnest(array[
      pg_temp.k('ana|203.0.113.7'), pg_temp.k('ana'), pg_temp.k('203.0.113.7'),
      pg_temp.k('ana|198.51.100.1'), pg_temp.k('198.51.100.1'), pg_temp.k('cara|'), pg_temp.k('cara')]) as t(k)$$,
  'every stored key is one the server sent');
select is_empty(
  $$select key_hash from public.auth_throttle_events
    where key_hash in (extensions.digest('ana@example.com', 'sha256'), extensions.digest('203.0.113.7', 'sha256'))$$,
  'and none is a plain SHA-256 of an email or an IP');

select * from finish();
rollback;
