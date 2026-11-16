-- Created with Claude Code (2026-11-16). claim_confirmation_email()
-- (20261116090000_confirmation_email_limit.sql): 5 a day per student, then
-- false; students cannot see or skip the count. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values
  ('f3000000-0000-4000-8000-000000000001', 'limit-ana@example.com'),
  ('f3000000-0000-4000-8000-000000000002', 'limit-ben@example.com');

select ok(not has_function_privilege('anon', 'public.claim_confirmation_email()', 'execute'), 'anon cannot claim');
select ok(not has_table_privilege('authenticated', 'public.confirmation_email_sends', 'select'), 'students cannot read the count');
select ok(not has_table_privilege('authenticated', 'public.confirmation_email_sends', 'delete'), 'or clear it');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(array[public.claim_confirmation_email(), public.claim_confirmation_email(), public.claim_confirmation_email(),
  public.claim_confirmation_email(), public.claim_confirmation_email()], array[true, true, true, true, true], 'five a day go out');
select is(public.claim_confirmation_email(), false, 'the sixth is skipped');

set local request.jwt.claims = '{"sub":"f3000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.claim_confirmation_email(), true, 'another student still gets theirs');

select * from finish();
rollback;
