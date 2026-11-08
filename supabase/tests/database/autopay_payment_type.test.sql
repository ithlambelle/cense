-- Created with Claude Code (2026-11-08). Card setup and autopay (US-10):
-- card_applications.autopay_payment_type, the spend_limit plan step, and no
-- due-date email while autopay is on (20261108200000_autopay_payment_type.sql).
-- Run with `npx supabase test db` on the local stack. One transaction, rolled
-- back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

create temp table students (name text primary key, id uuid);
insert into students values
  ('autopay_on',  'd0000000-0000-4000-8000-000000000001'),
  ('autopay_off', 'd0000000-0000-4000-8000-000000000002'),
  ('other',       'd0000000-0000-4000-8000-000000000003');
insert into auth.users (id, email) select id, 'autopay-' || name || '@example.com' from students;
grant select on students to authenticated;

create function pg_temp.student(p_name text) returns uuid language sql as $$
  select id from students where name = p_name;
$$;

-- An approved card with no closing day (the scheduler adds nothing of its own),
-- its autopay set at insert so no later update re-plans the rows below.
create function pg_temp.card(p_student uuid, p_autopay text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status, autopay_status)
  values (p_student, 'Test card', 'application', 'approved', p_autopay)
  returning id into v_id;
  return v_id;
end;
$$;

create temp table cards (name text primary key, id uuid);
insert into cards values
  ('on',  pg_temp.card(pg_temp.student('autopay_on'), 'on')),
  ('off', pg_temp.card(pg_temp.student('autopay_off'), 'off'));
grant select on cards to authenticated;

-- 1. The payment type
select lives_ok(
  $$update public.card_applications set autopay_payment_type = 'minimum' where id = (select id from cards where name = 'on')$$,
  'a payment type saves while autopay is on');
select throws_ok(
  $$update public.card_applications set autopay_payment_type = 'statement_balance' where id = (select id from cards where name = 'off')$$,
  '23514', null,
  'no payment type while autopay is off');
select throws_ok(
  $$update public.card_applications set autopay_payment_type = 'everything' where id = (select id from cards where name = 'on')$$,
  '23514', null,
  'only the known payment types');
select throws_ok(
  $$update public.card_applications set autopay_status = 'off' where id = (select id from cards where name = 'on')$$,
  '23514', null,
  'turning autopay off needs the payment type cleared too');

-- A student sets their own card's type and cannot touch another student's.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.student('autopay_on'), 'role', 'authenticated')::text, true);
select results_eq(
  $$update public.card_applications set autopay_payment_type = 'fixed_amount' where id = (select id from cards where name = 'on') returning autopay_payment_type$$,
  $$values ('fixed_amount'::text)$$,
  'a student saves their own card''s payment type');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.student('other'), 'role', 'authenticated')::text, true);
select is_empty(
  $$update public.card_applications set autopay_payment_type = 'minimum' where id = (select id from cards where name = 'on') returning id$$,
  'another student cannot change it');
select is_empty(
  $$select autopay_payment_type from public.card_applications where id = (select id from cards where name = 'on')$$,
  'or read it');
reset role;

-- 2. The spend_limit step
select lives_ok(
  $$insert into public.plan_steps (student_id, card_application_id, plan, step)
    values (pg_temp.student('autopay_on'), (select id from cards where name = 'on'), 'first_month', 'spend_limit')$$,
  'spend_limit is a first-month step');
select throws_ok(
  $$insert into public.plan_steps (student_id, card_application_id, plan, step)
    values (pg_temp.student('autopay_on'), (select id from cards where name = 'on'), 'denial', 'spend_limit')$$,
  '23514', null,
  'and not a denial step');

-- 3. The due-date email, due today on both cards
insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
select a.student_id, a.id, 'payment_due', (now() at time zone 'America/New_York')::date + 2, now() - interval '1 hour'
from public.card_applications a where a.id in (select id from cards);

create temp table claimed as select * from public.claim_due_reminders(1000);

select is_empty(
  $$select kind from claimed where student_id = pg_temp.student('autopay_on')$$,
  'no due-date email while autopay is on');
select results_eq(
  $$select kind from claimed where student_id = pg_temp.student('autopay_off')$$,
  $$values ('payment_due'::text)$$,
  'the due-date email still goes while autopay is off');

select * from finish();
rollback;
