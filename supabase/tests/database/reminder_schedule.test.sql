-- Created with Claude Code (2026-10-25). The reminder scheduler in the
-- database: refresh_reminders() and its date rules. Run with
-- `npx supabase test db` on the local stack (CI does this in the e2e job).
-- Everything runs in one transaction that is rolled back, so nothing is kept.
-- Dates are fixed with refresh_reminders' p_today; every student is on
-- America/New_York (no time zone saved), so 9:00 there is the send time.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

-- The card's set-up day is the server's own clock; the tests set it by hand.
alter table public.card_applications disable trigger card_applications_set_card_set_up_at;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'schedule-new@example.com'),
  ('a0000000-0000-4000-8000-000000000002', 'schedule-added@example.com'),
  ('a0000000-0000-4000-8000-000000000003', 'schedule-late@example.com'),
  ('a0000000-0000-4000-8000-000000000004', 'schedule-settings@example.com'),
  ('a0000000-0000-4000-8000-000000000005', 'schedule-unsubscribed@example.com');

-- An approved card with its closing and due days, set up on p_set_up.
create function pg_temp.approved_card(p_student uuid, p_source text, p_close int, p_due int, p_set_up date)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status, statement_closing_day, payment_due_day, card_set_up_at)
  values (p_student, 'Test card', p_source, 'approved', p_close, p_due, (p_set_up + time '12:00') at time zone 'America/New_York')
  returning id into v_id;
  return v_id;
end;
$$;

-- One card's unsent reminders as (kind, occurrence, send time in New York).
create function pg_temp.planned(p_application uuid)
returns table (kind text, occurrence date, sends text)
language sql
as $$
  select kind, occurrence, to_char(due_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI')
  from public.reminders
  where card_application_id = p_application and sent_at is null
  order by kind;
$$;

-- Date rules
select is(public.reminder_next_on_day(31, '2027-02-01'), date '2027-02-28', 'day 31 in February is its last day');
select is(public.reminder_next_on_day(31, '2028-02-01'), date '2028-02-29', 'day 31 in a leap February is the 29th');
select is(public.reminder_next_on_day(30, '2027-01-31'), date '2027-02-28', 'a day already past this month moves to next month');
select is(public.reminder_next_on_day(12, '2026-10-12'), date '2026-10-12', 'today counts as the next day');

-- A new card (source application) set up Oct 25, closing day 12, due day 9:
-- closing reminder 3 days before Nov 12, the first-statement email the day
-- after it, and the first payment due after that statement (Dec 9).
create temp table cards (name text primary key, id uuid);
insert into cards values
  ('new', pg_temp.approved_card('a0000000-0000-4000-8000-000000000001', 'application', 12, 9, '2026-10-25'));
select public.refresh_reminders((select id from cards where name = 'new'), '2026-10-25');
select results_eq(
  $$select * from pg_temp.planned((select id from cards where name = 'new'))$$,
  $$values ('check_autopay', date '2026-11-12', '2026-11-13 09:00'),
           ('payment_due', date '2026-12-09', '2026-12-06 09:00'),
           ('statement_closing', date '2026-11-12', '2026-11-09 09:00')$$,
  'a new card gets the closing reminder, the first-statement email and its first payment due after the first statement');

-- Changing the days re-plans the unsent reminders; a closing day 3 days away
-- or less is sent today.
update public.card_applications set statement_closing_day = 28, payment_due_day = 22
where id = (select id from cards where name = 'new');
select public.refresh_reminders((select id from cards where name = 'new'), '2026-10-25');
select results_eq(
  $$select * from pg_temp.planned((select id from cards where name = 'new'))$$,
  $$values ('check_autopay', date '2026-10-28', '2026-10-29 09:00'),
           ('payment_due', date '2026-11-22', '2026-11-19 09:00'),
           ('statement_closing', date '2026-10-28', '2026-10-25 09:00')$$,
  'new days replace the unsent reminders, and a close inside 3 days is sent today');

-- A card the student already had (source added) gets its next due date
-- straight away and never the first-statement email.
insert into cards values
  ('added', pg_temp.approved_card('a0000000-0000-4000-8000-000000000002', 'added', 12, 9, '2026-10-25'));
select public.refresh_reminders((select id from cards where name = 'added'), '2026-10-25');
select results_eq(
  $$select * from pg_temp.planned((select id from cards where name = 'added'))$$,
  $$values ('payment_due', date '2026-11-09', '2026-11-06 09:00'),
           ('statement_closing', date '2026-11-12', '2026-11-09 09:00')$$,
  'a card the student already had gets its next due date and no first-statement email');

-- Due day before closing day: the payment after a December close is in January.
insert into cards values
  ('year_end', pg_temp.approved_card('a0000000-0000-4000-8000-000000000002', 'application', 25, 20, '2026-12-01'));
select public.refresh_reminders((select id from cards where name = 'year_end'), '2026-12-01');
select is(
  (select occurrence from public.reminders where card_application_id = (select id from cards where name = 'year_end') and kind = 'payment_due'),
  date '2027-01-20',
  'a due day before the closing day falls in the next month, across the new year');

-- The first-statement email goes at most 3 days after the first close.
-- Set up Oct 20 with closing day 21: on Oct 24 it is still due (today);
-- on Oct 25 the close was 4 days ago and it is not scheduled.
insert into cards values
  ('late', pg_temp.approved_card('a0000000-0000-4000-8000-000000000003', 'application', 21, 15, '2026-10-20'));
select public.refresh_reminders((select id from cards where name = 'late'), '2026-10-24');
select results_eq(
  $$select kind, occurrence, sends from pg_temp.planned((select id from cards where name = 'late')) where kind = 'check_autopay'$$,
  $$values ('check_autopay', date '2026-10-21', '2026-10-24 09:00')$$,
  'a first-statement email whose day passed unsent goes today, within 3 days of the close');
select public.refresh_reminders((select id from cards where name = 'late'), '2026-10-25');
select is(
  (select count(*)::int from public.reminders where card_application_id = (select id from cards where name = 'late') and kind = 'check_autopay'),
  0,
  'no first-statement email more than 3 days after the first statement closed');

-- Set up long ago (Aug 1), first statement Aug 12: none in October.
insert into cards values
  ('old', pg_temp.approved_card('a0000000-0000-4000-8000-000000000003', 'application', 12, 9, '2026-08-01'));
select public.refresh_reminders((select id from cards where name = 'old'), '2026-10-25');
select is(
  (select count(*)::int from public.reminders where card_application_id = (select id from cards where name = 'old') and kind = 'check_autopay'),
  0,
  'a card set up months ago never gets the first-statement email');
select is(
  (select occurrence from public.reminders where card_application_id = (select id from cards where name = 'old') and kind = 'payment_due'),
  date '2026-11-09',
  'a card past its first statement gets its next due date');

-- Autopay on: no first-statement email.
insert into cards values
  ('autopay', pg_temp.approved_card('a0000000-0000-4000-8000-000000000004', 'application', 12, 9, '2026-10-25'));
update public.card_applications set autopay_status = 'on' where id = (select id from cards where name = 'autopay');
select public.refresh_reminders((select id from cards where name = 'autopay'), '2026-10-25');
select is(
  (select count(*)::int from public.reminders where card_application_id = (select id from cards where name = 'autopay') and kind = 'check_autopay'),
  0,
  'no first-statement email while autopay is on');

-- Each kind turned off removes its reminders; on again brings them back.
update public.profiles
set remind_statement_closing = false, remind_check_autopay = false
where student_id = 'a0000000-0000-4000-8000-000000000004';
update public.card_applications set autopay_status = 'unknown' where id = (select id from cards where name = 'autopay');
select public.refresh_reminders((select id from cards where name = 'autopay'), '2026-10-25');
select results_eq(
  $$select kind from pg_temp.planned((select id from cards where name = 'autopay'))$$,
  $$values ('payment_due')$$,
  'kinds turned off are not scheduled');
update public.profiles
set remind_statement_closing = true, remind_check_autopay = true
where student_id = 'a0000000-0000-4000-8000-000000000004';
select public.refresh_reminders((select id from cards where name = 'autopay'), '2026-10-25');
select results_eq(
  $$select kind from pg_temp.planned((select id from cards where name = 'autopay'))$$,
  $$values ('check_autopay'), ('payment_due'), ('statement_closing')$$,
  'kinds turned back on are scheduled again');

-- Unsubscribed: nothing is scheduled.
insert into cards values
  ('unsubscribed', pg_temp.approved_card('a0000000-0000-4000-8000-000000000005', 'application', 12, 9, '2026-10-25'));
update public.profiles set reminders_unsubscribed_at = now() where student_id = 'a0000000-0000-4000-8000-000000000005';
select public.refresh_reminders((select id from cards where name = 'unsubscribed'), '2026-10-25');
select is(
  (select count(*)::int from public.reminders where card_application_id = (select id from cards where name = 'unsubscribed')),
  0,
  'an unsubscribed student has nothing scheduled');

-- A card no longer approved loses its unsent card reminders.
update public.card_applications set status = 'rejected' where id = (select id from cards where name = 'new');
select public.refresh_reminders((select id from cards where name = 'new'), '2026-10-25');
select is(
  (select count(*)::int from public.reminders where card_application_id = (select id from cards where name = 'new')),
  0,
  'a rejected card has no card reminders');

-- Sent reminders are never touched by a re-plan.
update public.reminders set claimed_at = now(), sent_at = now()
where card_application_id = (select id from cards where name = 'added') and kind = 'statement_closing';
update public.card_applications set statement_closing_day = 20 where id = (select id from cards where name = 'added');
select public.refresh_reminders((select id from cards where name = 'added'), '2026-10-25');
select is(
  (select count(*)::int from public.reminders
   where card_application_id = (select id from cards where name = 'added') and kind = 'statement_closing' and sent_at is not null and occurrence = '2026-11-12'),
  1,
  'a sent reminder stays as it was when the days change');

-- Students cannot run the scheduler.
select ok(
  not has_function_privilege('authenticated', 'public.refresh_reminders(uuid, date)', 'execute'),
  'students cannot run refresh_reminders');

select * from finish();
rollback;
