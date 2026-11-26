-- Created with Claude Code (2026-11-26). The application check-ins
-- (20261126160000_application_check_ins.sql): "Heard back yet?" 7 and 21
-- days after applying, and "Has your letter come?" 10 days after a denial
-- the student is waiting on the letter for. Planned by refresh_reminders(),
-- sent through claim_due_reminders(). One transaction, rolled back at the end.
-- Every student is on America/New_York (no time zone saved) unless set.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(26);

create temp table students (name text primary key, id uuid, confirmed boolean default true);
insert into students (name, id) values
  ('day6',         'c1000000-0000-4000-8000-000000000001'),
  ('day7',         'c1000000-0000-4000-8000-000000000002'),
  ('decided',      'c1000000-0000-4000-8000-000000000003'),
  ('day21',        'c1000000-0000-4000-8000-000000000004'),
  ('third',        'c1000000-0000-4000-8000-000000000005'),
  ('setting_off',  'c1000000-0000-4000-8000-000000000006'),
  ('unsubscribed', 'c1000000-0000-4000-8000-000000000007'),
  ('letter9',      'c1000000-0000-4000-8000-000000000008'),
  ('letter10',     'c1000000-0000-4000-8000-000000000009'),
  ('letter_got',   'c1000000-0000-4000-8000-000000000010'),
  ('forced',       'c1000000-0000-4000-8000-000000000011');
insert into students (name, id, confirmed) values
  ('unverified',   'c1000000-0000-4000-8000-000000000012', false);
insert into auth.users (id, email, email_confirmed_at)
select id, 'checkin-' || name || '@example.com', case when confirmed then now() end from students;

create function pg_temp.student(p_name text) returns uuid language sql as $$
  select id from students where name = p_name;
$$;

create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'America/New_York')::date;
$$;

-- Noon on New York's calendar `p_days` ago, as an instant.
create function pg_temp.days_ago(p_days int) returns timestamptz language sql as $$
  select ((pg_temp.today() - p_days) + time '12:00') at time zone 'America/New_York';
$$;

-- Settings first.
update public.profiles set remind_application_updates = false where student_id = pg_temp.student('setting_off');
update public.profiles set reminders_unsubscribed_at = now() where student_id = pg_temp.student('unsubscribed');

-- An application marked "I applied" `p_days` ago; the insert plans its check-ins.
create function pg_temp.applied(p_student text, p_days int) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status, applied_at)
  values (pg_temp.student(p_student), 'Test card', 'application', 'applied', pg_temp.days_ago(p_days))
  returning id into v_id;
  return v_id;
end;
$$;

-- A denial `p_days` ago that the student is waiting on the letter for. The
-- denial time is set straight (set_rejected_at keeps the first one), then planned.
create function pg_temp.waiting_on_letter(p_student text, p_days int) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status)
  values (pg_temp.student(p_student), 'Test card', 'application', 'rejected')
  returning id into v_id;
  set local session_replication_role = replica;
  update public.card_applications set rejected_at = pg_temp.days_ago(p_days), denial_reason = 'no_letter_yet' where id = v_id;
  set local session_replication_role = origin;
  perform public.refresh_reminders(v_id);
  return v_id;
end;
$$;

create function pg_temp.check_ins(p_app uuid, p_kind text) returns setof date language sql as $$
  select occurrence from public.reminders where card_application_id = p_app and kind = p_kind order by occurrence;
$$;

create temp table apps (name text primary key, id uuid);
insert into apps values
  ('day6',         pg_temp.applied('day6', 6)),
  ('day7',         pg_temp.applied('day7', 7)),
  ('decided',      pg_temp.applied('decided', 7)),
  ('day21',        pg_temp.applied('day21', 21)),
  ('third',        pg_temp.applied('third', 21)),
  ('setting_off',  pg_temp.applied('setting_off', 7)),
  ('unsubscribed', pg_temp.applied('unsubscribed', 7)),
  ('unverified',   pg_temp.applied('unverified', 7)),
  ('letter9',      pg_temp.waiting_on_letter('letter9', 9)),
  ('letter10',     pg_temp.waiting_on_letter('letter10', 10)),
  ('letter_got',   pg_temp.waiting_on_letter('letter_got', 10));

create function pg_temp.app(p_name text) returns uuid language sql as $$
  select id from apps where name = p_name;
$$;

-- Planning.
select results_eq($$select pg_temp.check_ins(pg_temp.app('day6'), 'heard_back')$$,
  $$values (pg_temp.today() + 1), (pg_temp.today() + 15)$$,
  'applying plans "Heard back yet?" for day 7 and day 21');
select results_eq($$select pg_temp.check_ins(pg_temp.app('day21'), 'heard_back')$$,
  $$values (pg_temp.today())$$,
  'a day 7 check-in more than 6 days past is not planned');
select is_empty($$select pg_temp.check_ins(pg_temp.app('setting_off'), 'heard_back')$$,
  'nothing is planned with Application updates off');
select is_empty($$select pg_temp.check_ins(pg_temp.app('unsubscribed'), 'heard_back')$$,
  'nothing is planned for an unsubscribed student');
select results_eq($$select pg_temp.check_ins(pg_temp.app('letter10'), 'letter_check')$$,
  $$values (pg_temp.today())$$,
  'waiting on the letter plans "Has your letter come?" 10 days after the denial');

-- A decision removes the unsent check-ins.
update public.card_applications set status = 'approved' where id = pg_temp.app('decided');
select is_empty($$select pg_temp.check_ins(pg_temp.app('decided'), 'heard_back')$$,
  'a decision removes the unsent check-ins');
-- "I got my letter" (a reason saved) removes the letter check-in.
update public.card_applications set denial_reason = 'income' where id = pg_temp.app('letter_got');
select is_empty($$select pg_temp.check_ins(pg_temp.app('letter_got'), 'letter_check')$$,
  'saving the letter''s reason removes the letter check-in');

-- Rows the claim must refuse even if they exist: a check-in for a decided
-- application, and a letter check-in for a reason already saved.
-- (the reason is saved first: saving it re-plans, which would remove the row)
create function pg_temp.forced(p_status text, p_reason text, p_kind text) returns void language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status, denial_reason)
  values (pg_temp.student('forced'), 'Test card ' || p_kind, 'application', p_status, p_reason)
  returning id into v_id;
  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
  values (pg_temp.student('forced'), v_id, p_kind, pg_temp.today(), now() - interval '1 hour');
end;
$$;
select pg_temp.forced('approved', null, 'heard_back');
select pg_temp.forced('rejected', 'income', 'letter_check');

-- The first sent check-in for 'third', two weeks ago.
insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at, claimed_at, attempted_at, attempts, sent_at)
values (pg_temp.student('third'), pg_temp.app('third'), 'heard_back', pg_temp.today() - 14,
        now() - interval '14 days', now() - interval '14 days', now() - interval '14 days', 1, now() - interval '14 days');

create temp table claim1 as select * from public.claim_due_reminders(1000);

create function pg_temp.claimed(p_claim text, p_student text) returns setof text language plpgsql as $$
begin
  return query execute format('select kind from %I where student_id = $1', p_claim) using pg_temp.student(p_student);
end;
$$;

-- Claiming.
select is_empty($$select pg_temp.claimed('claim1', 'day6')$$, 'day 6: no check-in yet');
select results_eq($$select pg_temp.claimed('claim1', 'day7')$$, $$values ('heard_back')$$, 'day 7: "Heard back yet?" is sent');
select is((select card_application_id from claim1 where student_id = pg_temp.student('day7')), pg_temp.app('day7'),
  'the claim returns the application, for the email''s links');
select is_empty($$select pg_temp.claimed('claim1', 'decided')$$, 'nothing for a decided application');
select is_empty($$select pg_temp.claimed('claim1', 'forced')$$,
  'no check-in for a decided application or a letter already in, even if one was planned');
select results_eq($$select pg_temp.claimed('claim1', 'day21')$$, $$values ('heard_back')$$, 'day 21: the second check-in is sent');
select results_eq($$select pg_temp.claimed('claim1', 'third')$$, $$values ('heard_back')$$,
  'day 21 after the first was sent: the second goes');
select is_empty($$select pg_temp.claimed('claim1', 'setting_off')$$, 'nothing with Application updates off');
select is_empty($$select pg_temp.claimed('claim1', 'unsubscribed')$$, 'nothing for an unsubscribed student');
select is_empty($$select pg_temp.claimed('claim1', 'unverified')$$, 'nothing to an account whose email is not confirmed');
select is_empty($$select pg_temp.claimed('claim1', 'letter9')$$, 'day 9 after the denial: no letter check-in yet');
select results_eq($$select pg_temp.claimed('claim1', 'letter10')$$, $$values ('letter_check')$$,
  'day 10 after the denial: "Has your letter come?" is sent');
select is_empty($$select pg_temp.claimed('claim1', 'letter_got')$$, 'nothing once the letter''s reason is saved');

-- Never a third, and the letter once: mark them sent, then re-plan with a
-- time zone that moves the student's calendar.
select public.mark_reminder_sent(reminder_id) from claim1
where student_id in (pg_temp.student('third'), pg_temp.student('letter10'));
update public.profiles set time_zone = 'Pacific/Kiritimati'
where student_id in (pg_temp.student('third'), pg_temp.student('letter10'));
select public.refresh_reminders(pg_temp.app('third'));
select is((select count(*)::int from public.reminders where card_application_id = pg_temp.app('third') and kind = 'heard_back'), 2,
  'never a third "Heard back yet?"');
update public.card_applications set denial_reason = 'income' where id = pg_temp.app('letter10');
update public.card_applications set denial_reason = 'no_letter_yet' where id = pg_temp.app('letter10');
select is((select count(*)::int from public.reminders where card_application_id = pg_temp.app('letter10') and kind = 'letter_check'), 1,
  'the letter check-in comes once per application');

-- The cron runs again the same day: nothing sent twice.
create temp table claim2 as select * from public.claim_due_reminders(1000);
select is((select count(*)::int from claim2 where kind in ('heard_back', 'letter_check')
           and student_id in (select id from students)), 0,
  'a second run the same day claims no check-in again');

-- Students can turn the setting off and on; turning it on plans again.
update public.profiles set remind_application_updates = true where student_id = pg_temp.student('setting_off');
select results_eq($$select pg_temp.check_ins(pg_temp.app('setting_off'), 'heard_back')$$,
  $$values (pg_temp.today()), (pg_temp.today() + 14)$$,
  'turning Application updates back on plans the check-ins again');
select ok(has_column_privilege('authenticated', 'public.profiles', 'remind_application_updates', 'update'),
  'students can change Application updates');
select ok(not has_function_privilege('authenticated', 'public.claim_due_reminders(integer)', 'execute'),
  'students still cannot claim reminders');

select * from finish();
rollback;
