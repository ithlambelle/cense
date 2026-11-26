-- Created with Claude Code (2026-11-26). public.goals
-- (20261126140000_goals.sql): one goal per student, only their own, only
-- sensible values, and gone with the account.
-- Run with `npx supabase test db` on the local stack (CI does this in the e2e
-- job). One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

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
select lives_ok($$insert into public.goals (student_id, preset, name, amount_cents, target_date)
  values ('90a10000-0000-4000-8000-000000000001', 'emergency_fund', 'Emergency fund', 124000, null)
  on conflict (student_id) do update set preset = excluded.preset, name = excluded.name, amount_cents = excluded.amount_cents,
    target_date = excluded.target_date, student_id = excluded.student_id$$,
  'a student saves their own goal');
select lives_ok($$insert into public.goals (student_id, preset, name, amount_cents, target_date)
  values ('90a10000-0000-4000-8000-000000000001', 'trip', 'Trip', 60000, current_date + 90)
  on conflict (student_id) do update set preset = excluded.preset, name = excluded.name, amount_cents = excluded.amount_cents,
    target_date = excluded.target_date, student_id = excluded.student_id$$,
  'and saving again replaces it');
select is((select count(*)::int from public.goals), 1, 'one goal per student');
select is((select preset || ':' || amount_cents from public.goals), 'trip:60000', 'the newer goal is the one kept');
select throws_ok($$insert into public.goals (student_id, preset, name, amount_cents)
  values ('90a10000-0000-4000-8000-000000000002', 'trip', 'Trip', 100)$$, '42501', null, 'a student cannot save a goal for someone else');
select throws_ok($$insert into public.goals (student_id, preset, name, amount_cents)
  values ('90a10000-0000-4000-8000-000000000001', 'start_investing', 'Start investing', 100)
  on conflict (student_id) do update set preset = excluded.preset$$, '23514', null, 'only the demo''s presets: no Start investing');
select throws_ok($$update public.goals set amount_cents = 0$$, '23514', null, 'an amount must be more than nothing');
select throws_ok($$update public.goals set amount_cents = 100000001$$, '23514', null, 'and at most $1,000,000');
select throws_ok($$update public.goals set name = '   '$$, '23514', null, 'a name is needed');
select throws_ok($$update public.goals set name = repeat('x', 41)$$, '23514', null, 'of at most 40 characters');
select throws_ok($$update public.goals set created_at = now() - interval '1 year'$$, '42501', null, 'students cannot rewrite when it was made');
select throws_ok($$update public.goals set student_id = '90a10000-0000-4000-8000-000000000002'$$, '42501', null,
  'or hand their goal to someone else');
reset role;

-- bo has a goal; ana cannot see, change or delete it
insert into public.goals (student_id, preset, name, amount_cents) values
  ('90a10000-0000-4000-8000-000000000002', 'car', 'Buy a car', 500000);
set local role authenticated;
set local request.jwt.claims = '{"sub":"90a10000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select array_agg(preset) from public.goals), array['trip'], 'a student reads only their own goal');
select is_empty($$update public.goals set amount_cents = 1 where student_id = '90a10000-0000-4000-8000-000000000002' returning 1$$,
  'and cannot change another student''s');
select is_empty($$delete from public.goals where student_id = '90a10000-0000-4000-8000-000000000002' returning 1$$,
  'or delete it');
reset role;

-- Deleting the account deletes the goal.
delete from auth.users where id = '90a10000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.goals where student_id = '90a10000-0000-4000-8000-000000000002'), 0,
  'deleting the account deletes the goal');

select * from finish();
rollback;
