-- Created with Claude Code (2026-11-19). profiles.welcomed_at
-- (20261119100000_profiles_welcomed_at.sql): a new student starts with no
-- welcome seen, a student can mark only their own, and the backfill marks
-- only the students who existed when the migration ran, once. Run with
-- `npx supabase test db` on the local stack (CI does this in the e2e job).
-- One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

create temp table students (name text primary key, id uuid);
insert into students values
  ('fresh',    '7e1c0000-0000-4000-8000-000000000001'),
  ('other',    '7e1c0000-0000-4000-8000-000000000002'),
  ('before_1', '7e1c0000-0000-4000-8000-000000000003'),
  ('before_2', '7e1c0000-0000-4000-8000-000000000004'),
  ('after',    '7e1c0000-0000-4000-8000-000000000005');
grant select on students to authenticated;

create function pg_temp.student(p_name text) returns uuid language sql as $$
  select id from students where name = p_name;
$$;

-- act as a signed-in student
create function pg_temp.as_student(p_name text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.student(p_name), 'role', 'authenticated')::text, true);
$$;

-- a sign-up: handle_new_student() makes the profile
create function pg_temp.sign_up(p_name text) returns void language sql as $$
  insert into auth.users (id, email) values (pg_temp.student(p_name), 'welcomed-at-' || p_name || '@example.com');
$$;

create function pg_temp.welcomed_at(p_name text) returns timestamptz language sql as $$
  select welcomed_at from public.profiles where student_id = pg_temp.student(p_name);
$$;

-------------------------------------------------------------------------------
-- The column: a nullable time with no default.
select has_column('public', 'profiles', 'welcomed_at', 'profiles has welcomed_at');
select col_type_is('public', 'profiles', 'welcomed_at', 'timestamp with time zone', 'it is a time with a time zone');
select col_is_null('public', 'profiles', 'welcomed_at', 'it can be empty');
select col_hasnt_default('public', 'profiles', 'welcomed_at', 'and starts empty, with no default');

select pg_temp.sign_up('fresh');
select pg_temp.sign_up('other');
select is((select count(*)::int from public.profiles where student_id in (pg_temp.student('fresh'), pg_temp.student('other')) and welcomed_at is null), 2,
  'a student who signs up has not seen the welcome');

-------------------------------------------------------------------------------
-- The grant: students may set welcomed_at, alongside the columns part 2 of
-- 20261117100000_security_db_limits.sql granted, and nothing else changes.
select ok(has_column_privilege('authenticated', 'public.profiles', 'welcomed_at', 'UPDATE'),
  'students may change welcomed_at');
select set_eq(
  $$ select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE' $$,
  array['remind_statement_closing', 'remind_payment_due', 'remind_check_autopay', 'reminders_unsubscribed_at',
        'analytics_opted_out_at', 'welcomed_at',
        -- 20261126160000_application_check_ins.sql: the Application updates switch
        'remind_application_updates'],
  'and otherwise only the reminder settings and the Analytics switch, as before');
select ok(not has_column_privilege('anon', 'public.profiles', 'welcomed_at', 'UPDATE'),
  'signed out, no one can change it');

set local role authenticated;
select pg_temp.as_student('fresh');
-- what PUT /me/welcome sends
select results_eq(
  $$ update public.profiles set welcomed_at = now()
     where student_id = pg_temp.student('fresh') and welcomed_at is null
     returning welcomed_at is not null $$,
  $$ values (true) $$,
  'a student marks their own welcome as seen, as the app does');
select is_empty(
  $$ update public.profiles set welcomed_at = now()
     where student_id = pg_temp.student('fresh') and welcomed_at is null
     returning student_id $$,
  'a second "Let''s go" changes nothing');
select is_empty(
  $$ update public.profiles set welcomed_at = now()
     where student_id = pg_temp.student('other')
     returning student_id $$,
  'a student cannot mark another student''s welcome');
select throws_ok(
  $$ update public.profiles set time_zone = 'Asia/Tokyo' where student_id = pg_temp.student('fresh') $$,
  '42501', null, 'and the grant opens no other column');
reset role;
select is(pg_temp.welcomed_at('other'), null, 'the other student still has their welcome to come');

-------------------------------------------------------------------------------
-- The backfill. The stack already ran the migration on an empty database, so
-- this undoes the column (as the rollback does), adds two students who signed
-- up before it, and runs the migration again, statement for statement.
-- web/src/lib/first-login.test.ts checks these statements match the file.
alter table public.profiles drop column if exists welcomed_at;
select pg_temp.sign_up('before_1');
select pg_temp.sign_up('before_2');

-- migration: start
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'welcomed_at'
  ) then
    alter table public.profiles add column welcomed_at timestamptz;
    update public.profiles set welcomed_at = now();
  end if;
end;
$$;

grant update (welcomed_at) on public.profiles to authenticated;
-- migration: end

select is((select count(*)::int from public.profiles where student_id in (pg_temp.student('before_1'), pg_temp.student('before_2')) and welcomed_at = now()), 2,
  'every student who existed when it ran is marked as welcomed, so they never see it');
select ok(has_column_privilege('authenticated', 'public.profiles', 'welcomed_at', 'UPDATE'),
  'and students may change it again after the column is made');

select pg_temp.sign_up('after');
select is(pg_temp.welcomed_at('after'), null, 'a student who signs up afterwards will see the welcome');

-- Run again: nothing changes, so the new student keeps their welcome and an
-- earlier time is not moved.
update public.profiles set welcomed_at = '2026-11-01 12:00:00+00' where student_id = pg_temp.student('before_1');
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'welcomed_at'
  ) then
    alter table public.profiles add column welcomed_at timestamptz;
    update public.profiles set welcomed_at = now();
  end if;
end;
$$;
grant update (welcomed_at) on public.profiles to authenticated;
select is(pg_temp.welcomed_at('after'), null, 'run again, it does not mark a student who signed up in between');
select is(pg_temp.welcomed_at('before_1'), '2026-11-01 12:00:00+00'::timestamptz, 'or move a time already saved');

-- The rollback (supabase/rollbacks/20261119100000_profiles_welcomed_at.down.sql).
alter table public.profiles drop column if exists welcomed_at;
select hasnt_column('public', 'profiles', 'welcomed_at', 'the rollback removes the column');
select ok(not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'welcomed_at'),
  'and its grant with it');

select * from finish();
rollback;
