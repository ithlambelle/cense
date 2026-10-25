-- Created with Claude Code (2026-10-25). The reminder sender's rules in the
-- database: claim_due_reminders(), release_reminder_claim() and
-- mark_reminder_sent(). Run with `npx supabase test db` on the local stack
-- (CI does this in the e2e job). One transaction, rolled back at the end.
--
-- now() is fixed for the whole transaction, so "today" is the same in every
-- claim below; a later day is made by moving a reminder's claim back a day.
-- Every student is on America/New_York (no time zone saved).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

create temp table students (name text primary key, id uuid);
insert into students values
  ('added',        'c0000000-0000-4000-8000-000000000001'),
  ('stale',        'c0000000-0000-4000-8000-000000000002'),
  ('fresh',        'c0000000-0000-4000-8000-000000000003'),
  ('tie',          'c0000000-0000-4000-8000-000000000004'),
  ('autopay_tie',  'c0000000-0000-4000-8000-000000000005'),
  ('one_a_day',    'c0000000-0000-4000-8000-000000000006'),
  ('retry',        'c0000000-0000-4000-8000-000000000007'),
  ('sent_today',   'c0000000-0000-4000-8000-000000000008'),
  ('unsubscribed', 'c0000000-0000-4000-8000-000000000009'),
  ('kind_off',     'c0000000-0000-4000-8000-000000000010'),
  ('passed',       'c0000000-0000-4000-8000-000000000011'),
  ('rejected',     'c0000000-0000-4000-8000-000000000012');
insert into auth.users (id, email) select id, 'claim-' || name || '@example.com' from students;

create function pg_temp.student(p_name text) returns uuid language sql as $$
  select id from students where name = p_name;
$$;

-- Settings first: changing them re-plans, which would remove the rows below.
update public.profiles set reminders_unsubscribed_at = now() where student_id = pg_temp.student('unsubscribed');
update public.profiles set remind_payment_due = false where student_id = pg_temp.student('kind_off');

-- A card with no closing day, so the scheduler adds nothing of its own and
-- the reminders below are the only ones.
create function pg_temp.card(p_student uuid, p_source text default 'application', p_status text default 'approved')
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status)
  values (p_student, 'Test card', p_source, p_status)
  returning id into v_id;
  return v_id;
end;
$$;

-- A reminder that came due an hour ago, about a day `p_days` from today on
-- the student's calendar.
create function pg_temp.due(p_card uuid, p_kind text, p_days int, p_id uuid default gen_random_uuid())
returns uuid
language sql
as $$
  insert into public.reminders (id, student_id, card_application_id, kind, occurrence, due_at)
  select p_id, a.student_id, a.id, p_kind, (now() at time zone 'America/New_York')::date + p_days, now() - interval '1 hour'
  from public.card_applications a where a.id = p_card
  returning id;
$$;

create temp table rows (name text primary key, id uuid);
insert into rows values
  ('added',        pg_temp.due(pg_temp.card(pg_temp.student('added'), 'added'), 'check_autopay', -1)),
  ('stale',        pg_temp.due(pg_temp.card(pg_temp.student('stale')), 'check_autopay', -5)),
  ('fresh',        pg_temp.due(pg_temp.card(pg_temp.student('fresh')), 'check_autopay', -1)),
  ('retry',        pg_temp.due(pg_temp.card(pg_temp.student('retry')), 'statement_closing', 2)),
  ('unsubscribed', pg_temp.due(pg_temp.card(pg_temp.student('unsubscribed')), 'statement_closing', 2)),
  ('kind_off',     pg_temp.due(pg_temp.card(pg_temp.student('kind_off')), 'payment_due', 2)),
  ('passed',       pg_temp.due(pg_temp.card(pg_temp.student('passed')), 'statement_closing', -1)),
  ('rejected',     pg_temp.due(pg_temp.card(pg_temp.student('rejected'), 'application', 'rejected'), 'statement_closing', 2));

-- Two reminders due the same day, with the same send time. The ids put the
-- one that can wait first, so a tie broken by id would pick it.
with card as (select pg_temp.card(pg_temp.student('tie')) as id)
select pg_temp.due(id, 'statement_closing', 1, 'c0000000-0000-4000-8000-000000000401'),
       pg_temp.due(id, 'payment_due', 0, 'c0000000-0000-4000-8000-000000000402')
from card;
with card as (select pg_temp.card(pg_temp.student('autopay_tie')) as id)
select pg_temp.due(id, 'check_autopay', -1, 'c0000000-0000-4000-8000-000000000501'),
       pg_temp.due(id, 'payment_due', 0, 'c0000000-0000-4000-8000-000000000502')
from card;

-- Two cards, both with a reminder due today.
select pg_temp.due(pg_temp.card(pg_temp.student('one_a_day')), 'statement_closing', 2),
       pg_temp.due(pg_temp.card(pg_temp.student('one_a_day')), 'statement_closing', 2);

-- One already sent today, one more due.
create temp table sent_row as
  select pg_temp.due(pg_temp.card(pg_temp.student('sent_today')), 'payment_due', 2) as id;
update public.reminders set claimed_at = now(), sent_at = now() where id = (select id from sent_row);
select pg_temp.due(pg_temp.card(pg_temp.student('sent_today')), 'statement_closing', 2);

-- The first run of the day.
create temp table claim1 as select * from public.claim_due_reminders(1000);

create function pg_temp.claimed(p_claim text, p_student text) returns setof text language plpgsql as $$
begin
  return query execute format('select kind from %I where student_id = $1', p_claim) using pg_temp.student(p_student);
end;
$$;

select is_empty($$select pg_temp.claimed('claim1', 'added')$$,
  'no first-statement email for a card the student already had');
select is_empty($$select pg_temp.claimed('claim1', 'stale')$$,
  'no first-statement email more than 3 days after the first statement closed');
select results_eq($$select pg_temp.claimed('claim1', 'fresh')$$, $$values ('check_autopay')$$,
  'a first-statement email the day after a new card''s first close is sent');
select results_eq($$select pg_temp.claimed('claim1', 'tie')$$, $$values ('payment_due')$$,
  'with two due, the payment due today goes before the closing tomorrow');
select results_eq($$select pg_temp.claimed('claim1', 'autopay_tie')$$, $$values ('payment_due')$$,
  'with two due, the payment due today goes before the first-statement email');
select is((select count(*)::int from claim1 where student_id = pg_temp.student('one_a_day')), 1,
  'at most one email a day per student');
select results_eq($$select pg_temp.claimed('claim1', 'retry')$$, $$values ('statement_closing')$$,
  'a due reminder is claimed');
select is_empty($$select pg_temp.claimed('claim1', 'sent_today')$$,
  'nothing for a student who already had an email today');
select is_empty($$select pg_temp.claimed('claim1', 'unsubscribed')$$,
  'nothing for an unsubscribed student');
select is_empty($$select pg_temp.claimed('claim1', 'kind_off')$$,
  'nothing for a kind the student turned off');
select is_empty($$select pg_temp.claimed('claim1', 'passed')$$,
  'nothing about a closing date that has passed');
select is_empty($$select pg_temp.claimed('claim1', 'rejected')$$,
  'no card reminder for a card that is no longer approved');

-- The send failed. The reminder is released, and a second run the same day
-- (the job run again by hand) does not try it again.
select is(public.release_reminder_claim((select id from rows where name = 'retry')), false,
  'a first failed attempt is not the last');
create temp table claim2 as select * from public.claim_due_reminders(1000);
select is_empty($$select pg_temp.claimed('claim2', 'retry')$$,
  'a reminder tried today is not tried again today');
select is((select count(*)::int from claim2 where student_id = pg_temp.student('one_a_day')), 0,
  'a student with an email being sent gets no second one');

-- The next day it is tried again; after the third failure it is given up on.
create function pg_temp.next_day(p_id uuid) returns void language sql as $$
  update public.reminders
  set claimed_at = claimed_at - interval '1 day', attempted_at = attempted_at - interval '1 day'
  where id = p_id;
$$;
select pg_temp.next_day((select id from rows where name = 'retry'));
create temp table claim3 as select * from public.claim_due_reminders(1000);
select is((select attempts::int from public.reminders where id = (select id from rows where name = 'retry')
           and exists (select 1 from claim3 where reminder_id = (select id from rows where name = 'retry'))), 2,
  'the next day, a failed reminder is tried a second time');
select is(public.release_reminder_claim((select id from rows where name = 'retry')), false,
  'a second failed attempt is not the last');
select pg_temp.next_day((select id from rows where name = 'retry'));
create temp table claim4 as select * from public.claim_due_reminders(1000);
select is((select attempts::int from public.reminders where id = (select id from rows where name = 'retry')
           and exists (select 1 from claim4 where reminder_id = (select id from rows where name = 'retry'))), 3,
  'the day after, a third time');
select is(public.release_reminder_claim((select id from rows where name = 'retry')), true,
  'the third failed attempt is reported as the last');
select pg_temp.next_day((select id from rows where name = 'retry'));
create temp table claim5 as select * from public.claim_due_reminders(1000);
select is_empty($$select pg_temp.claimed('claim5', 'retry')$$,
  'after 3 attempts the reminder is not tried again');

-- Marked sent once.
select is(public.mark_reminder_sent((select id from rows where name = 'fresh')), true, 'a claimed reminder is marked sent');
select is(public.mark_reminder_sent((select id from rows where name = 'fresh')), false, 'and only once');

-- Who can run the sender: the service role only.
select ok(has_function_privilege('service_role', 'public.release_reminder_claim(uuid)', 'execute'),
  'the cron job (service role) can release a claim');
select ok(not has_function_privilege('authenticated', 'public.release_reminder_claim(uuid)', 'execute'),
  'students cannot release a claim');
select ok(not has_function_privilege('authenticated', 'public.claim_due_reminders(integer)', 'execute'),
  'students cannot claim reminders');

select * from finish();
rollback;
