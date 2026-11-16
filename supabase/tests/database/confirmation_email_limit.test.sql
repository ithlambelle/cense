-- Created with Claude Code (2026-11-16, updated 2026-11-17).
-- claim_confirmation_email(p_student_id) (20261116090000_confirmation_email_limit.sql,
-- changed by 20261117110000_security_quotas.sql): 5 in any 24 hours per
-- student, then false; 100 in all. Updated 2026-11-17 because the claim now
-- takes the student's id and only the service role may call it (the server
-- passes the id from the verified session), so the old calls as a signed-in
-- student would now be refused. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email) values
  ('f3000000-0000-4000-8000-000000000001', 'limit-ana@example.com'),
  ('f3000000-0000-4000-8000-000000000002', 'limit-ben@example.com');
-- Start from an empty count (rolled back with the rest), so sends from other
-- local runs in the last 24 hours cannot fill the shared limit.
delete from public.confirmation_email_sends;

select ok(not has_function_privilege('anon', 'public.claim_confirmation_email(uuid)', 'execute'), 'anon cannot claim');
select ok(not has_function_privilege('authenticated', 'public.claim_confirmation_email(uuid)', 'execute'), 'nor can a signed-in student');
select ok(not has_table_privilege('authenticated', 'public.confirmation_email_sends', 'select'), 'students cannot read the count');
select ok(not has_table_privilege('authenticated', 'public.confirmation_email_sends', 'delete'), 'or clear it');

set local role service_role;
select is(array[public.claim_confirmation_email('f3000000-0000-4000-8000-000000000001'),
  public.claim_confirmation_email('f3000000-0000-4000-8000-000000000001'),
  public.claim_confirmation_email('f3000000-0000-4000-8000-000000000001'),
  public.claim_confirmation_email('f3000000-0000-4000-8000-000000000001'),
  public.claim_confirmation_email('f3000000-0000-4000-8000-000000000001')], array[true, true, true, true, true], 'five a day go out');
select is(public.claim_confirmation_email('f3000000-0000-4000-8000-000000000001'), false, 'the sixth is skipped');
select is(public.claim_confirmation_email('f3000000-0000-4000-8000-000000000002'), true, 'another student still gets theirs');

-- All students together: past 100 in the last 24 hours, nobody gets one.
reset role;
insert into public.confirmation_email_sends (student_id)
  select 'f3000000-0000-4000-8000-000000000002' from generate_series(1, 100);
set local role service_role;
select is(public.claim_confirmation_email('f3000000-0000-4000-8000-000000000002'), false, 'past 100 a day in all, the email is skipped');

select * from finish();
rollback;
