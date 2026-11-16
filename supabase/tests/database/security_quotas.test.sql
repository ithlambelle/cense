-- Created with Claude Code (2026-11-17). The fixes in
-- 20261117110000_security_quotas.sql, from the security audit of a8fe7d4:
-- the Penny and confirmation email limits are rolling 24 hours that no
-- setting moves, outlive account deletion, and only the service role may
-- claim them; a deleted account's Plaid cleanup row is given up after 5
-- failures; save_bank_link refuses a value not shaped like a sealed token;
-- every plaid table has row level security on, and the functions that read
-- them still work. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(30);

insert into auth.users (id, email) values
  ('f4000000-0000-4000-8000-000000000001', 'quota-ana@example.com'),
  ('f4000000-0000-4000-8000-000000000002', 'quota-ben@example.com'),
  ('f4000000-0000-4000-8000-000000000003', 'quota-cleanup@example.com'),
  ('f4000000-0000-4000-8000-000000000004', 'quota-bank@example.com');
insert into public.profiles (student_id, time_zone) values
  ('f4000000-0000-4000-8000-000000000001', 'America/New_York')
  on conflict (student_id) do update set time_zone = excluded.time_zone;
-- Start from empty counts (rolled back with the rest), so questions and
-- emails from other local runs cannot fill the shared limits.
delete from public.penny_asks;
delete from public.confirmation_email_sends;

-- Who may claim --------------------------------------------------------------

select ok(not has_function_privilege('authenticated', 'public.claim_penny_ask(uuid)', 'execute'), 'a signed-in student cannot claim a Penny question');
select ok(not has_function_privilege('anon', 'public.claim_penny_ask(uuid)', 'execute'), 'nor can anon');
select ok(has_function_privilege('service_role', 'public.claim_penny_ask(uuid)', 'execute'), 'the service role can');
select ok(not has_function_privilege('authenticated', 'public.claim_confirmation_email(uuid)', 'execute'), 'a signed-in student cannot claim an email');
select ok(has_function_privilege('service_role', 'public.claim_confirmation_email(uuid)', 'execute'), 'the service role can');
select is(to_regprocedure('public.claim_penny_ask()'), null, 'the old claim with no student id is gone');
select is(to_regprocedure('public.claim_confirmation_email()'), null, 'for emails too');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.claim_penny_ask('f4000000-0000-4000-8000-000000000002')$$, '42501', null,
  'calling it directly as a student is refused, so nobody can burn the shared 300');
select throws_ok($$select public.claim_confirmation_email('f4000000-0000-4000-8000-000000000002')$$, '42501', null,
  'or the shared 100 emails');
reset role;

-- A rolling 24 hours that the time zone does not move -----------------------

-- 20 questions over the last 23 hours: the limit, whatever the time zone.
insert into public.penny_asks (student_id, asked_at)
  select 'f4000000-0000-4000-8000-000000000001', now() - interval '23 hours' + n * interval '1 minute'
  from generate_series(1, 20) n;
set local role service_role;
select is(public.claim_penny_ask('f4000000-0000-4000-8000-000000000001'), 'student_limit', 'twenty in the last 24 hours is the limit');
reset role;
-- Before this fix, switching to a zone that had just passed midnight started
-- a new day and a fresh count.
update public.profiles set time_zone = 'Pacific/Kiritimati' where student_id = 'f4000000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.claim_penny_ask('f4000000-0000-4000-8000-000000000001'), 'student_limit', 'changing the time zone does not reset it');
reset role;
update public.profiles set time_zone = 'Etc/GMT+12' where student_id = 'f4000000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.claim_penny_ask('f4000000-0000-4000-8000-000000000001'), 'student_limit', 'nor does the zone furthest the other way');
reset role;
-- Questions older than 24 hours no longer count.
update public.penny_asks set asked_at = asked_at - interval '2 hours'
  where student_id = 'f4000000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.claim_penny_ask('f4000000-0000-4000-8000-000000000001'), 'ok', 'once they are more than 24 hours old, a question is free again');
reset role;

-- The shared limit is a rolling 24 hours too.
insert into public.penny_asks (student_id, asked_at)
  select 'f4000000-0000-4000-8000-000000000002', now() - interval '20 hours' from generate_series(1, 300);
set local role service_role;
select is(public.claim_penny_ask('f4000000-0000-4000-8000-000000000001'), 'daily_limit', '300 in the last 24 hours in all is the shared limit');
reset role;
delete from public.penny_asks where student_id = 'f4000000-0000-4000-8000-000000000002';

-- Counts outlive the account ---------------------------------------------------

set local role service_role;
select is(array[public.claim_confirmation_email('f4000000-0000-4000-8000-000000000002'),
  public.claim_confirmation_email('f4000000-0000-4000-8000-000000000002'),
  public.claim_confirmation_email('f4000000-0000-4000-8000-000000000002'),
  public.claim_confirmation_email('f4000000-0000-4000-8000-000000000002'),
  public.claim_confirmation_email('f4000000-0000-4000-8000-000000000002')], array[true, true, true, true, true], 'ben gets five emails');
select is(public.claim_penny_ask('f4000000-0000-4000-8000-000000000002'), 'ok', 'and asks one question');
reset role;
select lives_ok($$delete from auth.users where id = 'f4000000-0000-4000-8000-000000000002'$$, 'ben deletes his account');
select is((select count(*)::int from public.confirmation_email_sends where student_id = 'f4000000-0000-4000-8000-000000000002'), 5,
  'his email count stays, so the shared count cannot be reset by deleting');
select is((select count(*)::int from public.penny_asks where student_id = 'f4000000-0000-4000-8000-000000000002'), 1,
  'his question count stays too');
select is((select count(*)::int from public.penny_asks where asked_at > now() - interval '24 hours'), 2,
  'and still counts toward the shared 300');
-- Still deleted after two days, as before.
update public.penny_asks set asked_at = now() - interval '3 days' where student_id = 'f4000000-0000-4000-8000-000000000002';
set local role service_role;
select is(public.claim_penny_ask('f4000000-0000-4000-8000-000000000001'), 'ok', 'the next question clears out old rows');
reset role;
select is((select count(*)::int from public.penny_asks where student_id = 'f4000000-0000-4000-8000-000000000002'), 0,
  'rows older than two days are still deleted');

-- The Plaid cleanup gives up after 5 failures --------------------------------

-- A forged token: the right shape, but it can never be decrypted.
insert into plaid.items (student_id, item_id, token_ciphertext)
  values ('f4000000-0000-4000-8000-000000000003', 'quota-forged-item', 'v1.' || repeat('A', 40));
delete from auth.users where id = 'f4000000-0000-4000-8000-000000000003';

create temporary table cleanup_runs (attempt int, last_attempt boolean, finished boolean);
do $$
declare
  job record;
begin
  for n in 1..5 loop
    update plaid.account_cleanup set retry_at = now() - interval '1 second' where item_id = 'quota-forged-item';
    select * into strict job from public.claim_plaid_account_cleanup() c where c.item_id = 'quota-forged-item';
    insert into cleanup_runs values (n, job.last_attempt, public.finish_plaid_account_cleanup(job.id, job.claim_id, false));
  end loop;
end;
$$;
select is((select array_agg(last_attempt order by attempt) from cleanup_runs), array[false, false, false, false, true],
  'the fifth claim says it is the last attempt');
select isnt((select gave_up_at from plaid.account_cleanup where item_id = 'quota-forged-item'), null,
  'after the fifth failure the row is given up');
update plaid.account_cleanup set retry_at = now() - interval '1 second' where item_id = 'quota-forged-item';
select is((select count(*)::int from public.claim_plaid_account_cleanup() c where c.item_id = 'quota-forged-item'), 0,
  'and is never claimed again, so the cleanup check stops failing');
select is((select count(*)::int from plaid.account_cleanup where item_id = 'quota-forged-item'), 1,
  'the encrypted row is kept for an operator, not dropped');

-- save_bank_link refuses what is not a sealed token -----------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$select public.save_bank_link('quota-bank-item', 'v1.garbage', 'First Platypus Bank')$$, '22023', null,
  'a value too short to be a sealed token is refused');
select lives_ok($$select public.save_bank_link('quota-bank-item', 'v1.' || repeat('B', 40), 'First Platypus Bank')$$,
  'a sealed-token shape is saved');
select is((select count(*)::int from public.bank_link_secret()), 1,
  'and read back through bank_link_secret with row level security on plaid.items');
reset role;

select is((select array_agg(c.relname::text order by c.relname) from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'plaid' and c.relkind in ('r', 'p') and not (c.relrowsecurity and not c.relforcerowsecurity)), null,
  'every plaid table has row level security on, not forced');

select * from finish();
rollback;
