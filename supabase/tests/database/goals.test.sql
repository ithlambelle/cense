-- Created with Claude Code (2026-11-26). public.goals
-- (20261126150200_goals.sql): one goal per student, only their own, only
-- sensible values, and gone with the account.
-- Run with `npx supabase test db` on the local stack (CI does this in the e2e
-- job). One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(39);

insert into auth.users (id, email) values
  ('90a10000-0000-4000-8000-000000000001', 'goals-ana@example.com'),
  ('90a10000-0000-4000-8000-000000000002', 'goals-bo@example.com');

-- What anon and students can reach.
select ok((select relrowsecurity from pg_class where oid = 'public.goals'::regclass), 'row level security is on for goals');
select ok(not has_table_privilege('anon', 'public.goals', 'select, insert, update, delete'), 'anon has no privilege on goals');
select ok(has_table_privilege('authenticated', 'public.goals', 'select, delete'), 'students may read and delete');
select ok(not has_column_privilege('authenticated', 'public.goals', 'created_at', 'insert, update'), 'students never set created_at');
select ok(not has_column_privilege('authenticated', 'public.goals', 'updated_at', 'insert, update'), 'or updated_at');

set local role anon;
select throws_ok($$select * from public.goals$$, '42501', null, 'signed out, no one reads goals');
reset role;

-- ana saves a goal, as PUT /me/goal does (an upsert on student_id)
set local role authenticated;
set local request.jwt.claims = '{"sub":"90a10000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$insert into public.goals (student_id, preset, name, amount_cents, target_date, monthly_cents)
  values ('90a10000-0000-4000-8000-000000000001', 'emergency_fund', 'Emergency fund', 124000, current_date + 180, 20667)
  on conflict (student_id) do update set preset = excluded.preset, name = excluded.name, amount_cents = excluded.amount_cents,
    target_date = excluded.target_date, monthly_cents = excluded.monthly_cents, student_id = excluded.student_id$$,
  'a student saves their own goal');
select lives_ok($$insert into public.goals (student_id, preset, name, amount_cents, target_date, monthly_cents)
  values ('90a10000-0000-4000-8000-000000000001', 'trip', 'Trip', 60000, current_date + 90, 20000)
  on conflict (student_id) do update set preset = excluded.preset, name = excluded.name, amount_cents = excluded.amount_cents,
    target_date = excluded.target_date, monthly_cents = excluded.monthly_cents, student_id = excluded.student_id$$,
  'and saving again replaces it');
select is((select count(*)::int from public.goals), 1, 'one goal per student');
select is((select preset || ':' || amount_cents from public.goals), 'trip:60000', 'the newer goal is the one kept');
select throws_ok($$insert into public.goals (student_id, preset, name, amount_cents, target_date, monthly_cents)
  values ('90a10000-0000-4000-8000-000000000002', 'trip', 'Trip', 100, current_date + 180, 17)$$, '42501', null, 'a student cannot save a goal for someone else');
select throws_ok($$insert into public.goals (student_id, preset, name, amount_cents, target_date, monthly_cents)
  values ('90a10000-0000-4000-8000-000000000001', 'start_investing', 'Start investing', 100, current_date + 180, 17)
  on conflict (student_id) do update set preset = excluded.preset$$, '23514', null, 'only the demo''s presets: no Start investing');
select throws_ok($$update public.goals set amount_cents = 0$$, '23514', null, 'an amount must be more than nothing');
select throws_ok($$update public.goals set amount_cents = 100000001$$, '23514', null, 'and at most $1,000,000');
select throws_ok($$update public.goals set name = '   '$$, '23514', null, 'a name is needed');
select throws_ok($$update public.goals set name = repeat('x', 41)$$, '23514', null, 'of at most 40 characters');
select throws_ok($$update public.goals set target_date = null$$, '23502', null, 'a goal always has a date, fixed when it is saved');
select throws_ok($$update public.goals set monthly_cents = amount_cents + 1$$, '23514', null, 'and never sets aside more a month than the whole goal');
select throws_ok($$update public.goals set created_at = now() - interval '1 year'$$, '42501', null, 'students cannot rewrite when it was made');
select throws_ok($$update public.goals set student_id = '90a10000-0000-4000-8000-000000000002'$$, '42501', null,
  'or hand their goal to someone else');
reset role;

-- bo has a goal; ana cannot see, change or delete it
insert into public.goals (student_id, preset, name, amount_cents, target_date, monthly_cents) values
  ('90a10000-0000-4000-8000-000000000002', 'car', 'Buy a car', 500000, current_date + 180, 83334);
set local role authenticated;
set local request.jwt.claims = '{"sub":"90a10000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select array_agg(preset) from public.goals), array['trip'], 'a student reads only their own goal');
select is_empty($$update public.goals set amount_cents = 1 where student_id = '90a10000-0000-4000-8000-000000000002' returning 1$$,
  'and cannot change another student''s');
select is_empty($$delete from public.goals where student_id = '90a10000-0000-4000-8000-000000000002' returning 1$$,
  'or delete it');
reset role;

-- Accept plan writes only the set-aside: bills stay as they are, even ones
-- changed since the plan was opened (accept_goal_plan()).
select ok(not has_function_privilege('anon', 'public.accept_goal_plan()', 'execute'), 'signed out, no one accepts a plan');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('90a10000-0000-4000-8000-000000000001', 'item-goals-ana', 'v1.test');
insert into public.bank_links (student_id, institution_name, set_aside_cents) values
  ('90a10000-0000-4000-8000-000000000001', 'First Platypus Bank', 5000);
insert into public.bill_coverage (student_id, bill, covered_by, monthly_cents, due_day) values
  ('90a10000-0000-4000-8000-000000000001', 'rent', 'me', 70000, 6);
set local role authenticated;
set local request.jwt.claims = '{"sub":"90a10000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.accept_goal_plan(), 'accepted', 'a student accepts the plan for their goal');
select is((select set_aside_cents from public.bank_links), 20000::bigint, 'the set-aside is the plan''s monthly amount');
select is((select accepted_monthly_cents from public.goals), 20000::bigint, 'and the goal remembers what was set aside');
select is((select monthly_cents::int || ':' || due_day from public.bill_coverage where bill = 'rent'), '70000:6', 'the bills are left exactly as they were');
update public.goals set monthly_cents = 0;
select is(public.accept_goal_plan(), 'nothing_to_set_aside', 'a plan that sets nothing aside changes nothing');
select is((select set_aside_cents from public.bank_links), 20000::bigint, 'not even the set-aside');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"90a10000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.accept_goal_plan(), 'no_bank', 'with no bank there is no set-aside to write');
reset role;

-- Remove my goal clears the set-aside only when it is still the plan's
-- (remove_goal()).
select ok(not has_function_privilege('anon', 'public.remove_goal()', 'execute'), 'signed out, no one removes a goal');
set local role authenticated;
set local request.jwt.claims = '{"sub":"90a10000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.remove_goal(), 'cleared', 'removing a goal whose plan is still the set-aside clears it');
select is((select set_aside_cents from public.bank_links), 0::bigint, 'the set-aside is back to nothing');
select is(public.remove_goal(), 'none', 'removing again finds no goal');
insert into public.goals (student_id, preset, name, amount_cents, target_date, monthly_cents, accepted_monthly_cents)
  values ('90a10000-0000-4000-8000-000000000001', 'trip', 'Trip', 60000, current_date + 90, 20000, 20000);
update public.bank_links set set_aside_cents = 7500;
select is(public.remove_goal(), 'kept', 'a set-aside the student changed since the plan stays');
select is((select set_aside_cents from public.bank_links), 7500::bigint, 'at what they set');
reset role;
select is((select count(*)::int from public.goals where student_id = '90a10000-0000-4000-8000-000000000002'), 1,
  'another student''s goal is untouched');

-- Deleting the account deletes the goal.
delete from auth.users where id = '90a10000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.goals where student_id = '90a10000-0000-4000-8000-000000000002'), 0,
  'deleting the account deletes the goal');

select * from finish();
rollback;
