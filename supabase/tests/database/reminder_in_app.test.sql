-- Created with Claude Code (2026-11-08). In-app reminders in the database:
-- snooze_reminder(), dismiss_reminder(), mark_reminders_read() as a signed-in
-- student, and raise_reminder_follow_ups() as the cron job. Run with
-- `npx supabase test db` on the local stack (CI does this in the e2e job).
-- One transaction, rolled back at the end. Every student is on
-- America/New_York (no time zone saved).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

create temp table students (name text primary key, id uuid);
insert into students values
  ('maya',  'd0000000-0000-4000-8000-000000000001'),
  ('other', 'd0000000-0000-4000-8000-000000000002');
insert into auth.users (id, email) select id, 'inapp-' || name || '@example.com' from students;
grant select on students to authenticated;

create function pg_temp.student(p_name text) returns uuid language sql as $$
  select id from students where name = p_name;
$$;

-- An approved card with no closing day, so the scheduler adds nothing of its
-- own. Its payment is due 10 days from today unless told otherwise.
create function pg_temp.card(p_student uuid, p_due_day int default extract(day from current_date + 10)::int) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status, payment_due_day)
  values (p_student, 'Test card', 'application', 'approved', p_due_day)
  returning id into v_id;
  return v_id;
end;
$$;

-- A reminder whose email went out, about a day `p_days` from today.
create function pg_temp.sent(p_card uuid, p_kind text, p_days int) returns uuid language sql as $$
  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at, claimed_at, sent_at, attempts)
  select a.student_id, a.id, p_kind, (now() at time zone 'America/New_York')::date + p_days,
         now() - interval '3 days', now() - interval '3 days', now() - interval '3 days', 1
  from public.card_applications a where a.id = p_card
  returning id;
$$;

create temp table rows (name text primary key, id uuid);
insert into rows values
  ('closing', pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'statement_closing', 2)),
  ('due',     pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'payment_due', 4)),
  ('theirs',  pg_temp.sent(pg_temp.card(pg_temp.student('other')), 'statement_closing', 2));
create function pg_temp.unsent(p_card uuid) returns uuid language sql as $$
  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
  select a.student_id, a.id, 'payment_due', current_date + 9, now() + interval '5 days'
  from public.card_applications a where a.id = p_card
  returning id;
$$;
insert into rows values ('unsent', pg_temp.unsent(pg_temp.card(pg_temp.student('maya'))));
grant select on rows to authenticated;

create function pg_temp.r(p_name text) returns uuid language sql as $$
  select id from rows where name = p_name;
$$;

-- The checks themselves.
select throws_ok(
  $$ update public.reminders set snoozed_until = now() + interval '1 day' where id = pg_temp.r('unsent') $$,
  '23514', null, 'an unsent reminder cannot carry in-app state');
select throws_ok(
  $$ update public.reminders set follow_up_at = now() where id = pg_temp.r('due') $$,
  '23514', null, 'only a statement-closing reminder can have a follow-up');

-- As Maya.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.student('maya'), 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.reminders where student_id = pg_temp.student('other')), 0,
  'Maya cannot read another student''s reminders');

-- snooze
select is((public.snooze_reminder(pg_temp.r('closing'), now() + interval '1 day')).snoozed_until,
  now() + interval '1 day', 'Maya snoozes her sent reminder until tomorrow');
select throws_ok(
  format($$ select public.snooze_reminder(%L, now() + interval '1 day') $$, pg_temp.r('theirs')),
  'P0002', 'reminder not found', 'Maya cannot snooze another student''s reminder');
select throws_ok(
  format($$ select public.snooze_reminder(%L, now() + interval '1 day') $$, pg_temp.r('unsent')),
  '55000', null, 'an unsent reminder cannot be snoozed');
select throws_ok(
  format($$ select public.snooze_reminder(%L, now() - interval '1 minute') $$, pg_temp.r('due')),
  '22023', null, 'a snooze into the past is refused');
select throws_ok(
  format($$ select public.snooze_reminder(%L, now() + interval '46 days') $$, pg_temp.r('due')),
  '22023', null, 'a snooze more than 45 days out is refused');
select throws_ok(
  format($$ select public.snooze_reminder(%L, null) $$, pg_temp.r('due')),
  '22023', null, 'a snooze needs a time');

-- the columns are not the student's to write
select throws_ok(
  format($$ update public.reminders set snoozed_until = now() + interval '30 days' where id = %L $$, pg_temp.r('due')),
  '42501', null, 'Maya cannot write snoozed_until directly');
select throws_ok(
  format($$ update public.reminders set follow_up_at = now() where id = %L $$, pg_temp.r('closing')),
  '42501', null, 'Maya cannot raise a follow-up herself');
select throws_ok(
  $$ select * from public.raise_reminder_follow_ups() $$,
  '42501', null, 'Maya cannot run the follow-up job');

-- mark all read
select is(public.mark_reminders_read(), 2, 'Mark all read marks Maya''s two sent reminders');
select is(public.mark_reminders_read(), 0, 'a second Mark all read changes nothing');
select is((select read_at from public.reminders where id = pg_temp.r('unsent')), null,
  'an unsent reminder is not marked read');

-- dismiss
select isnt((public.dismiss_reminder(pg_temp.r('due'))).dismissed_at, null, 'Maya dismisses a reminder for the cycle');
select throws_ok(
  format($$ select public.snooze_reminder(%L, now() + interval '1 day') $$, pg_temp.r('due')),
  '55000', null, 'a dismissed reminder cannot be snoozed');
select throws_ok(
  format($$ select public.dismiss_reminder(%L) $$, pg_temp.r('theirs')),
  'P0002', 'reminder not found', 'Maya cannot dismiss another student''s reminder');
select is((select dismissed_at from public.reminders where id = pg_temp.r('theirs')), null,
  'the other student''s reminder is untouched');

-- acted ("I paid it") closes the reminder for snoozing too
update public.reminders set acted_at = now() where id = pg_temp.r('closing');
select throws_ok(
  format($$ select public.snooze_reminder(%L, now() + interval '1 day') $$, pg_temp.r('closing')),
  '55000', null, 'a reminder marked paid cannot be snoozed');

reset role;
select set_config('request.jwt.claims', null, true);

-- Signed out.
set local role anon;
select throws_ok($$ select public.mark_reminders_read() $$, '42501', null, 'a visitor cannot mark reminders read');
reset role;

-- The follow-up job, as the cron job. Fresh rows, today fixed by p_today.
create temp table fu (name text primary key, id uuid);
insert into fu values
  ('ready',      pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'statement_closing', -2)),
  ('too_soon',   pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'statement_closing', -1)),
  ('paid',       pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'statement_closing', -2)),
  ('dismissed',  pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'statement_closing', -2)),
  ('snoozed',    pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'statement_closing', -2)),
  ('snooze_over', pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'statement_closing', -2)),
  ('past_due',   pg_temp.sent(pg_temp.card(pg_temp.student('maya'), (extract(day from (now() at time zone 'America/New_York')::date - 1))::int), 'statement_closing', -3)),
  ('payment',    pg_temp.sent(pg_temp.card(pg_temp.student('maya')), 'payment_due', -2));
update public.reminders set acted_at = now() where id = (select id from fu where name = 'paid');
update public.reminders set dismissed_at = now() where id = (select id from fu where name = 'dismissed');
update public.reminders set snoozed_until = now() + interval '1 day' where id = (select id from fu where name = 'snoozed');
update public.reminders set snoozed_until = now() - interval '1 minute' where id = (select id from fu where name = 'snooze_over');
-- the earlier rows (closing in 2 days, acted; theirs, in 2 days) are not due a follow-up either

create function pg_temp.followed(p_name text) returns boolean language sql as $$
  select follow_up_at is not null from public.reminders where id = (select id from fu where name = p_name);
$$;

set local role service_role;
select results_eq($$ select raised, skipped from public.raise_reminder_follow_ups() $$,
  $$ values (2, 0) $$, 'the job raises the two follow-ups that are due');
reset role;

select ok(pg_temp.followed('ready'), '2 days after the close, unpaid: followed up');
select ok(not pg_temp.followed('too_soon'), '1 day after the close: not yet');
select ok(not pg_temp.followed('paid'), 'marked paid: no follow-up');
select ok(not pg_temp.followed('dismissed'), 'dismissed for the cycle: no follow-up');
select ok(not pg_temp.followed('snoozed'), 'still snoozed: the follow-up waits');
select ok(pg_temp.followed('snooze_over'), 'the snooze is over: followed up');
select ok(not pg_temp.followed('past_due'), 'the payment due date has passed: no follow-up');
select ok(not pg_temp.followed('payment'), 'only statement-closing reminders are followed up');

set local role service_role;
select results_eq($$ select raised, skipped from public.raise_reminder_follow_ups() $$,
  $$ values (0, 0) $$, 'one follow-up only: a second run raises nothing');
reset role;

select * from finish();
rollback;
