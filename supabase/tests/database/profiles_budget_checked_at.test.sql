-- Created with Claude Code (2026-11-25). profiles.budget_checked_at
-- (20261125130000_profiles_budget_checked_at.sql): a new student has not
-- checked their budget, a student can mark only their own, and signed out no
-- one can. One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email) values
  ('b0d90000-0000-4000-8000-000000000001', 'budget-check-ana@example.com'),
  ('b0d90000-0000-4000-8000-000000000002', 'budget-check-bo@example.com');

select has_column('public', 'profiles', 'budget_checked_at', 'profiles has budget_checked_at');
select col_type_is('public', 'profiles', 'budget_checked_at', 'timestamp with time zone', 'it is a time with a time zone');
select col_hasnt_default('public', 'profiles', 'budget_checked_at', 'with no default');
select is((select count(*)::int from public.profiles
    where student_id in ('b0d90000-0000-4000-8000-000000000001', 'b0d90000-0000-4000-8000-000000000002') and budget_checked_at is null), 2,
  'a student who signs up has not checked their budget');
select ok(has_column_privilege('authenticated', 'public.profiles', 'budget_checked_at', 'UPDATE'), 'students may set it');
select ok(not has_column_privilege('anon', 'public.profiles', 'budget_checked_at', 'UPDATE'), 'signed out, no one can');

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0d90000-0000-4000-8000-000000000001","role":"authenticated"}';
-- what PUT /me/budget-check sends
select results_eq(
  $$ update public.profiles set budget_checked_at = now()
     where student_id = 'b0d90000-0000-4000-8000-000000000001'
     returning budget_checked_at is not null $$,
  $$ values (true) $$,
  'a student marks their own budget as checked, as the app does');
select is_empty(
  $$ update public.profiles set budget_checked_at = now()
     where student_id = 'b0d90000-0000-4000-8000-000000000002'
     returning student_id $$,
  'but never another student''s');
reset role;
select is((select budget_checked_at from public.profiles where student_id = 'b0d90000-0000-4000-8000-000000000002'), null,
  'the other student''s stays unchecked');

select * from finish();
rollback;
