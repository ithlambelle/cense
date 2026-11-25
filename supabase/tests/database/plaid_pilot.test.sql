-- Created with Claude Code (2026-11-25). The production Plaid pilot
-- (20261125120000_plaid_pilot.sql): who may link, each student's allowance,
-- the whole pilot's budget, that a claim never goes past either one, and that
-- no API role can read or change the pilot tables. Run with
-- `npx supabase test db` on the local stack (CI does this in the e2e job).
-- One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(36);

insert into auth.users (id, email) values
  ('9a110000-0000-4000-8000-000000000001', 'pilot-ana@example.com'),
  ('9a110000-0000-4000-8000-000000000002', 'pilot-bo@example.com'),
  ('9a110000-0000-4000-8000-000000000003', 'pilot-cy@example.com'),
  ('9a110000-0000-4000-8000-000000000004', 'not-in-pilot@example.com');

-- act as a signed-in student
create function pg_temp.as_student(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Who can reach what -----------------------------------------------------------

select ok(not has_schema_privilege('anon', 'pilot', 'usage'), 'anon cannot use the pilot schema');
select ok(not has_schema_privilege('authenticated', 'pilot', 'usage'), 'nor can a signed-in student');
select ok(not has_schema_privilege('service_role', 'pilot', 'usage'), 'nor the service role');
select ok(not has_table_privilege('authenticated', 'pilot.plaid_students', 'select'), 'a student cannot read the allowlist');
select ok(not has_table_privilege('authenticated', 'pilot.plaid_students', 'insert'), 'or add themselves to it');
select ok(not has_table_privilege('authenticated', 'pilot.plaid_item_budget', 'update'), 'or change the budget');
select ok(not has_table_privilege('service_role', 'pilot.plaid_item_budget', 'update'), 'and neither can the service role');
select ok(not has_function_privilege('anon', 'public.plaid_pilot_access()', 'execute'), 'anon cannot ask for access');
select ok(not has_function_privilege('anon', 'public.claim_plaid_item_slot()', 'execute'), 'or claim a slot');
select ok(has_function_privilege('authenticated', 'public.plaid_pilot_access()', 'execute'), 'a signed-in student can ask about themselves');
select ok(has_function_privilege('authenticated', 'public.claim_plaid_item_slot()', 'execute'), 'and claim for themselves');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
    where oid in ('public.plaid_pilot_access()'::regprocedure, 'public.claim_plaid_item_slot()'::regprocedure)),
  'both run as their owner with an empty search_path');
select is((select count(*)::int from pilot.plaid_item_budget), 1, 'the budget is one row');
select is((select budget from pilot.plaid_item_budget), 0, 'and starts at 0: nobody links until a team member sets it');

-- Nothing is open until the team opens it ----------------------------------------

insert into pilot.plaid_students (student_id) values
  ('9a110000-0000-4000-8000-000000000001'),
  ('9a110000-0000-4000-8000-000000000002'),
  ('9a110000-0000-4000-8000-000000000003');
select is((select allowance from pilot.plaid_students where student_id = '9a110000-0000-4000-8000-000000000001'), 1,
  'a student is added with an allowance of one Item');

set local role authenticated;
select pg_temp.as_student('9a110000-0000-4000-8000-000000000001');
select is(public.plaid_pilot_access(), 'full', 'with a budget of 0, a pilot student cannot link a new bank');
select is(public.claim_plaid_item_slot(), false, 'and cannot claim a slot');
select pg_temp.as_student('9a110000-0000-4000-8000-000000000004');
select is(public.plaid_pilot_access(), 'none', 'a student outside the pilot gets none');
reset role;

update pilot.plaid_item_budget set budget = 2;

-- Each student's own allowance ----------------------------------------------------

set local role authenticated;
select pg_temp.as_student('9a110000-0000-4000-8000-000000000001');
select is(public.plaid_pilot_access(), 'open', 'with room in the budget, a pilot student may link');
select is(public.claim_plaid_item_slot(), true, 'and takes a slot');
select is(public.plaid_pilot_access(), 'full', 'their one Item is used: no second bank, no relink');
select is(public.claim_plaid_item_slot(), false, 'calling the claim again directly takes nothing more');
select is(public.claim_plaid_item_slot(), false, 'however many times');
select pg_temp.as_student('9a110000-0000-4000-8000-000000000004');
select is(public.claim_plaid_item_slot(), false, 'a student outside the pilot cannot claim');
set local request.jwt.claims = '{"role":"authenticated"}';
select is(public.plaid_pilot_access(), 'none', 'a session with no student id has no access');
select is(public.claim_plaid_item_slot(), false, 'and cannot claim');
reset role;

select is((select used from pilot.plaid_item_budget), 1, 'only the one real claim counted against the budget');
select is((select claimed from pilot.plaid_students where student_id = '9a110000-0000-4000-8000-000000000001'), 1,
  'and against that student''s allowance');

-- The whole budget ------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_student('9a110000-0000-4000-8000-000000000002');
select is(public.claim_plaid_item_slot(), true, 'a second pilot student takes the last slot');
select pg_temp.as_student('9a110000-0000-4000-8000-000000000003');
select is(public.plaid_pilot_access(), 'full', 'a third, with their own allowance unused, sees the budget is used');
select is(public.claim_plaid_item_slot(), false, 'and cannot claim past it');
reset role;
select is((select used from pilot.plaid_item_budget), 2, 'the budget never goes past what the team set');

-- The team raises an allowance by hand (a relink after a disconnect) ----------------

update pilot.plaid_item_budget set budget = 3;
update pilot.plaid_students set allowance = 2 where student_id = '9a110000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_student('9a110000-0000-4000-8000-000000000001');
select is(public.plaid_pilot_access(), 'open', 'with a raised allowance and budget room, the student may link again');
select is(public.claim_plaid_item_slot(), true, 'and takes the slot');
reset role;
select is((select used from pilot.plaid_item_budget), 3, 'the budget counted it');

-- Deleting an account ---------------------------------------------------------------

delete from auth.users where id = '9a110000-0000-4000-8000-000000000002';
select is((select count(*)::int from pilot.plaid_students where student_id = '9a110000-0000-4000-8000-000000000002'), 0,
  'a deleted student leaves the allowlist');

select * from finish();
rollback;
