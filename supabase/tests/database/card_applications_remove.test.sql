-- Created with Claude Code (2026-11-26). Removing a card
-- (20261126140000_card_applications_remove.sql): a student removes only their
-- own card, only one they added themselves, and its reminders and setup steps
-- go with it. Run with `npx supabase test db` on the local stack. One
-- transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

create temp table students (name text primary key, id uuid);
insert into students values
  ('owner', 'ca5d0000-0000-4000-8000-000000000001'),
  ('other', 'ca5d0000-0000-4000-8000-000000000002');
insert into auth.users (id, email) select id, 'remove-card-' || name || '@example.com' from students;
grant select on students to authenticated;

create function pg_temp.student(p_name text) returns uuid language sql as $$
  select id from students where name = p_name;
$$;

create function pg_temp.as_student(p_name text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.student(p_name), 'role', 'authenticated')::text, true);
$$;

-- An approved card, with a payment reminder and a done setup step of its own.
create function pg_temp.card(p_student uuid, p_source text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status)
  values (p_student, 'Test card', p_source, 'approved')
  returning id into v_id;
  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
  values (p_student, v_id, 'payment_due', current_date + 10, now() + interval '7 days')
  on conflict do nothing;
  insert into public.plan_steps (student_id, card_application_id, plan, step)
  values (p_student, v_id, 'first_month', 'payment_reminder');
  return v_id;
end;
$$;

create temp table cards (name text primary key, id uuid);
insert into cards values
  ('added',   pg_temp.card(pg_temp.student('owner'), 'added')),
  ('applied', pg_temp.card(pg_temp.student('owner'), 'application')),
  ('theirs',  pg_temp.card(pg_temp.student('other'), 'added'));
grant select on cards to authenticated;

create function pg_temp.card_id(p_name text) returns uuid language sql as $$
  select id from cards where name = p_name;
$$;

create function pg_temp.hanging(p_name text) returns int language sql as $$
  select (select count(*) from public.reminders where card_application_id = pg_temp.card_id(p_name))::int
       + (select count(*) from public.plan_steps where card_application_id = pg_temp.card_id(p_name))::int;
$$;

select ok(pg_temp.hanging('added') >= 2, 'the added card starts with a reminder and a setup step');

-------------------------------------------------------------------------------
-- The grant: students may delete rows, and the policy decides which.
select ok(has_table_privilege('authenticated', 'public.card_applications', 'DELETE'), 'students may delete card rows');
select ok(not has_table_privilege('anon', 'public.card_applications', 'DELETE'), 'signed out, no one can');

set local role authenticated;
select pg_temp.as_student('owner');

select is_empty(
  $$ delete from public.card_applications where id = pg_temp.card_id('theirs') returning id $$,
  'a student cannot remove another student''s card');
select is_empty(
  $$ delete from public.card_applications where id = pg_temp.card_id('applied') returning id $$,
  'nor a card they applied for through Cense');
select results_eq(
  $$ delete from public.card_applications where id = pg_temp.card_id('added') and student_id = pg_temp.student('owner') returning id $$,
  $$ select pg_temp.card_id('added') $$,
  'a student removes a card they added, as DELETE /applications/{id} does');
select is_empty(
  $$ delete from public.card_applications where id = pg_temp.card_id('added') returning id $$,
  'removing it again finds nothing');
reset role;

-------------------------------------------------------------------------------
-- What hangs off it went with it; everything else stayed.
select is(pg_temp.hanging('added'), 0, 'its reminders and setup steps are gone');
select is((select count(*)::int from public.card_applications where id = pg_temp.card_id('added')), 0, 'the card is gone');
select is((select count(*)::int from public.card_applications where id in (pg_temp.card_id('applied'), pg_temp.card_id('theirs'))), 2,
  'the applied card and the other student''s card stay');
select ok(pg_temp.hanging('applied') >= 2, 'with their reminders and steps');
select ok(pg_temp.hanging('theirs') >= 2, 'for both');

select * from finish();
rollback;
