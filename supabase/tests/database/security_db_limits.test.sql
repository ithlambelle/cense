-- Created with Claude Code (2026-11-17). The database limits in
-- 20261117100000_security_db_limits.sql, each tested the way a student would
-- get around the API: as the authenticated role with their own id, straight
-- to the tables and functions. Run with `npx supabase test db` on the local
-- stack (CI does this in the e2e job). One transaction, rolled back at the
-- end. Every student is on America/New_York (no time zone saved).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(68);

create temp table students (name text primary key, id uuid);
insert into students values
  ('cap',          '5ec00000-0000-4000-8000-000000000001'),
  ('later',        '5ec00000-0000-4000-8000-000000000002'),
  ('added',        '5ec00000-0000-4000-8000-000000000003'),
  ('denied',       '5ec00000-0000-4000-8000-000000000004'),
  ('unsubscribed', '5ec00000-0000-4000-8000-000000000005');
insert into auth.users (id, email) select id, 'sec-limits-' || name || '@example.com' from students;
grant select on students to authenticated;

create function pg_temp.student(p_name text) returns uuid language sql as $$
  select id from students where name = p_name;
$$;

-- act as a signed-in student
create function pg_temp.as_student(p_name text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.student(p_name), 'role', 'authenticated')::text, true);
$$;

-- today and 9:00 on a day, on the New York calendar
create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'America/New_York')::date;
$$;
create function pg_temp.at9(p_day date) returns timestamptz language sql as $$
  select (p_day + time '09:00') at time zone 'America/New_York';
$$;

-- An approved card with closing and due days, inserted by the server.
create function pg_temp.card(p_student uuid, p_source text, p_close int, p_due int) returns uuid language sql as $$
  insert into public.card_applications (student_id, card_name, source, status, statement_closing_day, payment_due_day)
  values (p_student, 'Test card', p_source, 'approved', p_close, p_due)
  returning id;
$$;

-------------------------------------------------------------------------------
-- 1a. At most 25 card records per student, added the way the app does
-- (POST, then PATCH the days) with the student's own session.
set local role authenticated;
select pg_temp.as_student('cap');
do $$
begin
  for i in 1..25 loop
    insert into public.card_applications (student_id, card_id, card_name, source, status, credit_limit_cents, applied_at)
    values (pg_temp.student('cap'), 'card-' || i, 'Card ' || i, 'added', 'approved', 50000, null);
  end loop;
  update public.card_applications set statement_closing_day = 12, payment_due_day = 9
  where student_id = pg_temp.student('cap');
end;
$$;
select is((select count(*)::int from public.card_applications where student_id = pg_temp.student('cap')), 25,
  'a student adds 25 cards and saves their days, as the app does');
select throws_ok(
  $$ insert into public.card_applications (student_id, card_name, source, status)
     values (pg_temp.student('cap'), 'Card 26', 'application', 'applied') $$,
  '54000', 'a student can track at most 25 cards', 'the 26th card is refused');
select throws_ok(
  $$ insert into public.card_applications (student_id, card_name, source, status)
     values (pg_temp.student('cap'), 'Card 26', 'application', 'rejected') $$,
  '54000', null, 'whatever its status');
select pg_temp.as_student('later');
select lives_ok(
  $$ insert into public.card_applications (student_id, card_id, card_name, source, status)
     values (pg_temp.student('later'), 'chime-card', 'Chime Card', 'application', 'applied') $$,
  'another student still adds a card');
reset role;
select throws_ok(
  $$ insert into public.card_applications (student_id, card_name, source, status)
     values (pg_temp.student('cap'), 'Card 26', 'application', 'applied') $$,
  '54000', null, 'the cap holds for the server too');

-- 1b. The API's length limits.
select throws_ok(
  format($$ insert into public.card_applications (student_id, card_name, source, status) values (%L, %L, 'added', 'applied') $$,
    pg_temp.student('later'), repeat('x', 161)),
  '23514', null, 'a card name over 160 characters is refused');
select throws_ok(
  format($$ insert into public.card_applications (student_id, card_id, card_name, source, status) values (%L, %L, 'x', 'added', 'applied') $$,
    pg_temp.student('later'), repeat('x', 101)),
  '23514', null, 'a card id over 100 characters is refused');
select lives_ok(
  format($$ insert into public.card_applications (student_id, card_id, card_name, source, status) values (%L, %L, %L, 'added', 'applied') $$,
    pg_temp.student('later'), repeat('y', 100), repeat('y', 160)),
  'a card id of 100 and a name of 160 characters are kept');
select throws_ok(
  format($$ update public.card_applications set card_name = %L where student_id = %L $$, repeat('x', 161), pg_temp.student('later')),
  '23514', null, 'and a name cannot grow past 160 later');
select throws_ok(
  format($$ insert into public.issuer_clicks (student_id, card_id, kind) values (%L, %L, 'apply') $$,
    pg_temp.student('later'), repeat('x', 101)),
  '23514', null, 'an issuer click card id over 100 characters is refused');

-------------------------------------------------------------------------------
-- 1c. refresh_all_reminders, in batches, plans exactly what refreshing each
-- card did before.
select pg_temp.card(pg_temp.student('later'), 'application', 12, 9);
select pg_temp.card(pg_temp.student('added'), 'added', 3, 28);
select pg_temp.card(pg_temp.student('unsubscribed'), 'added', 20, 15);
insert into public.card_applications (student_id, card_name, source, status)
values (pg_temp.student('denied'), 'Denied card', 'application', 'rejected');
update public.profiles set reminders_unsubscribed_at = now() where student_id = pg_temp.student('unsubscribed');

create temp table mine as
  select a.id, a.student_id, a.status from public.card_applications a
  where a.student_id in (select id from students);

-- The same starting point for each run: no planned reminders, a stale one
-- (an old closing date), a reapply reminder for the denied card, and one
-- already sent, which no refresh may touch.
create function pg_temp.reset() returns void language plpgsql as $$
begin
  delete from public.reminders where student_id in (select id from students);
  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
  select student_id, id, 'statement_closing', pg_temp.today() - 40, now() - interval '43 days'
  from mine where student_id = pg_temp.student('later') and status = 'approved';
  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
  select student_id, id, 'reapply', pg_temp.today() + 30, pg_temp.at9(pg_temp.today() + 30)
  from mine where status = 'rejected';
  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at, claimed_at, sent_at, attempts)
  select student_id, id, 'payment_due', pg_temp.today() - 5, now() - interval '8 days', now() - interval '8 days', now() - interval '8 days', 1
  from mine where student_id = pg_temp.student('added');
end;
$$;

create function pg_temp.plan() returns table (card uuid, kind text, occurrence date, due_at timestamptz, sent boolean)
language sql as $$
  select card_application_id, kind, occurrence, due_at, sent_at is not null from public.reminders
  where student_id in (select id from students);
$$;

-- before: every approved or rejected card refreshed on its own, as the old
-- refresh_all_reminders() did
select pg_temp.reset();
do $$
declare v_id uuid;
begin
  for v_id in select id from mine where status in ('approved', 'rejected') loop
    perform public.refresh_reminders(v_id);
  end loop;
end;
$$;
create temp table before as select * from pg_temp.plan();

select ok((select count(*) from before where not sent and kind = 'statement_closing') = 27,
  'the old way plans a closing reminder for each of the 27 subscribed cards with days');

-- The refresh covers every student in the database, so hold other writers
-- off card_applications until this test ends (they only wait; none in CI).
lock table public.card_applications in share mode;

-- now, one call as the old job made it (no arguments), from the start
update public.reminder_refresh_state set pivot = null, last_done = null;
select pg_temp.reset();
select is(public.refresh_all_reminders(), null::uuid, 'one call with no arguments finishes everyone on a small database');
select set_eq($$ select * from pg_temp.plan() $$, $$ select * from before $$,
  'and plans exactly the same reminders as refreshing each card');

-- now in the smallest batches: one student per call, as a run of the job
create temp table calls (n int, answered uuid);
create function pg_temp.run_job() returns void language plpgsql as $$
declare
  v_after uuid := null;
  v_n int := 0;
begin
  delete from calls;
  loop
    v_after := public.refresh_all_reminders(v_after, interval '0 seconds');
    v_n := v_n + 1;
    insert into calls values (v_n, v_after);
    exit when v_after is null or v_n > 100000;
  end loop;
end;
$$;
create function pg_temp.students_refreshed() returns int language sql as $$
  select count(distinct student_id)::int from public.card_applications where status in ('approved', 'rejected');
$$;
select pg_temp.reset();
select pg_temp.run_job();
select is((select answered from calls where n = 1),
  (select student_id from public.card_applications where status in ('approved', 'rejected') order by student_id limit 1),
  'out of time, a call stops after one student and answers where to carry on');
select is((select count(*)::int from calls), pg_temp.students_refreshed() + 1,
  'one student per call, then null when everyone is done');
select is((select last_done from public.reminder_refresh_state), null::uuid,
  'a finished pass leaves nothing to carry on');
select ok((select count(*) from calls where answered = pg_temp.student('later')) = 1,
  'the student after the one with 25 cards gets a call of their own');
select set_eq($$ select * from pg_temp.plan() $$, $$ select * from before $$,
  'batches plan exactly the same reminders');
select ok(exists (select 1 from pg_temp.plan() p join mine m on m.id = p.card
                  where m.student_id = pg_temp.student('later') and p.kind = 'statement_closing' and not p.sent),
  'the later student''s next closing reminder is planned');

-- a run that stopped early: the next one starts right after the last
-- student it finished, so nobody is skipped day after day
select is(public.refresh_all_reminders(null, interval '0 seconds'),
  (select student_id from public.card_applications where status in ('approved', 'rejected') order by student_id limit 1),
  'a run that stops after one student');
select is((select last_done from public.reminder_refresh_state),
  (select student_id from public.card_applications where status in ('approved', 'rejected') order by student_id limit 1),
  'remembers the last student it finished');
update public.reminder_refresh_state set last_done = pg_temp.student('later');
select pg_temp.run_job();
select is((select answered from calls where n = 1),
  (select student_id from public.card_applications where status in ('approved', 'rejected')
   and student_id > pg_temp.student('later') order by student_id limit 1),
  'the next run starts right after that student');
select is((select count(*)::int from calls), pg_temp.students_refreshed() + 1,
  'and still reaches every student once');
select is((select answered from calls order by n desc offset 1 limit 1), pg_temp.student('later'),
  'wrapping around to end with that student');
select set_eq($$ select * from pg_temp.plan() $$, $$ select * from before $$,
  'and plans the same reminders');
select ok(not has_function_privilege('authenticated', 'public.refresh_all_reminders(uuid, interval)', 'execute'),
  'students cannot run the refresh');
select ok(not has_function_privilege('anon', 'public.refresh_all_reminders(uuid, interval)', 'execute'),
  'nor can anyone signed out');
select ok(has_function_privilege('service_role', 'public.refresh_all_reminders(uuid, interval)', 'execute'),
  'the cron job can');

-------------------------------------------------------------------------------
-- 2. Only the columns the app writes.
select set_eq(
  $$ select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'card_applications' and grantee = 'authenticated' and privilege_type = 'INSERT' $$,
  array['student_id', 'card_id', 'card_name', 'source', 'status', 'credit_limit_cents', 'applied_at'],
  'card_applications: students add only what POST /applications sends');
select set_eq(
  $$ select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'card_applications' and grantee = 'authenticated' and privilege_type = 'UPDATE' $$,
  array['status', 'credit_limit_cents', 'spend_limit_cents', 'denial_reason', 'denial_reason_note',
        'statement_closing_day', 'payment_due_day', 'autopay_status', 'autopay_updated_at', 'autopay_payment_type'],
  'card_applications: students change only what PATCH /applications/{id} sends');
select set_eq(
  $$ select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE' $$,
  array['remind_statement_closing', 'remind_payment_due', 'remind_check_autopay', 'reminders_unsubscribed_at', 'analytics_opted_out_at',
        -- 20261119100000_profiles_welcomed_at.sql: the first-login welcome
        'welcomed_at'],
  'profiles: students change only the reminder settings, the Analytics switch and when they were welcomed');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'insert'), 'students cannot add a profile');
-- 20261126140000_card_applications_remove.sql: students may delete, and its
-- policy limits that to their own cards added by hand.
select ok(has_table_privilege('authenticated', 'public.card_applications', 'delete'), 'students may remove a card record (policy-limited)');
select ok(not has_table_privilege('anon', 'public.card_applications', 'select')
          and not has_table_privilege('anon', 'public.profiles', 'select'),
  'signed out, neither table can be read at all');

set local role authenticated;
select pg_temp.as_student('later');
select throws_ok(
  $$ update public.card_applications set source = 'added' where student_id = pg_temp.student('later') $$,
  '42501', null, 'a student cannot change a card''s source');
select throws_ok(
  $$ update public.card_applications set updated_at = now() - interval '1 year' where student_id = pg_temp.student('later') $$,
  '42501', null, 'or its updated_at');
select throws_ok(
  $$ update public.card_applications set card_set_up_at = now() - interval '1 year' where student_id = pg_temp.student('later') $$,
  '42501', null, 'or when it was set up');
select throws_ok(
  $$ insert into public.card_applications (student_id, card_name, source, status, card_set_up_at)
     values (pg_temp.student('later'), 'x', 'added', 'approved', now()) $$,
  '42501', null, 'or add a card with a set-up time of its own');
select is_empty(
  $$ delete from public.card_applications where student_id = pg_temp.student('later') and source = 'application' returning id $$,
  'or delete a card applied for through Cense');
-- every column PATCH /applications/{id} writes, in one update
select results_eq(
  $$ update public.card_applications
     set status = 'approved', credit_limit_cents = 80000, spend_limit_cents = 20000,
         denial_reason = null, denial_reason_note = null, statement_closing_day = 14, payment_due_day = 11,
         autopay_status = 'on', autopay_updated_at = now(), autopay_payment_type = 'minimum'
     where student_id = pg_temp.student('later') and card_id = 'chime-card'
     returning status, statement_closing_day::int, autopay_payment_type $$,
  $$ values ('approved'::text, 14, 'minimum'::text) $$,
  'the app''s own card update still works');
select throws_ok(
  $$ update public.profiles set time_zone = 'Asia/Tokyo' where student_id = pg_temp.student('later') $$,
  '42501', null, 'a student cannot set their time zone directly');
select throws_ok(
  $$ update public.profiles set updated_at = now() where student_id = pg_temp.student('later') $$,
  '42501', null, 'or their profile''s updated_at');
select throws_ok(
  $$ insert into public.profiles (student_id) values (pg_temp.student('later')) $$,
  '42501', null, 'or add a profile');
select results_eq(
  $$ update public.profiles
     set remind_statement_closing = false, remind_payment_due = true, remind_check_autopay = false,
         reminders_unsubscribed_at = now(), analytics_opted_out_at = now()
     where student_id = pg_temp.student('later')
     returning remind_statement_closing, reminders_unsubscribed_at is not null, analytics_opted_out_at is not null $$,
  $$ values (false, true, true) $$,
  'the app''s reminder settings and Analytics switch still save');
select is((select count(*)::int from public.profiles), 1, 'and a student still reads only their own profile');

-------------------------------------------------------------------------------
-- 3. issuer_clicks: at most 50 a day, at the server's time.
select lives_ok(
  $$ insert into public.issuer_clicks (student_id, card_id, kind)
     select pg_temp.student('later'), 'chime-card', 'apply' from generate_series(1, 50) $$,
  'a student records 50 clicks in a day');
select throws_ok(
  $$ insert into public.issuer_clicks (student_id, card_id, kind) values (pg_temp.student('later'), 'chime-card', 'apply') $$,
  '54000', 'too many issuer clicks today', 'the 51st in 24 hours is refused');
select throws_ok(
  $$ insert into public.issuer_clicks (student_id, card_id, kind, clicked_at)
     values (pg_temp.student('later'), 'chime-card', 'apply', now() - interval '2 days') $$,
  '54000', null, 'and backdating the click does not get around it');
select pg_temp.as_student('added');
select results_eq(
  $$ insert into public.issuer_clicks (student_id, card_id, kind, clicked_at)
     values (pg_temp.student('added'), 'chime-card', 'preapproval', now() - interval '2 days')
     returning clicked_at = now() $$,
  $$ values (true) $$,
  'another student still clicks, and the time saved is the server''s');

-- quiz_drafts.answers: at most 8 KB
select lives_ok(
  $$ insert into public.quiz_drafts (student_id, answers)
     values (pg_temp.student('added'), '{"under21": true, "incomeBand": "under_5k", "student": true, "standing": "none",
       "recentDenial": false, "canDeposit": true, "spendingCategories": ["food_and_dining", "groceries"],
       "spendingBand": "200_to_500", "goal": "build_credit"}')
     on conflict (student_id) do update set answers = excluded.answers $$,
  'a full quiz draft saves');
select throws_ok(
  format($$ update public.quiz_drafts set answers = jsonb_build_object('padding', %L) where student_id = pg_temp.student('added') $$,
    repeat('x', 8200)),
  '23514', null, 'a quiz draft over 8 KB is refused');

-- save_recommendation: sizes
create function pg_temp.save(p_reason text, p_answers jsonb, p_result jsonb) returns void language sql as $$
  select public.save_recommendation('chime-card', 'likely_fit', p_reason, 'fit-rules v1.3', 'cards-abc', p_answers, p_result);
$$;
select lives_ok(
  format($$ select pg_temp.save('Builds credit', '{"student": true}', jsonb_build_object('cards', %L)) $$, repeat('x', 4200)),
  'a result the size of today''s largest saves');
select throws_ok(
  format($$ select pg_temp.save('Builds credit', '{"student": true}', jsonb_build_object('cards', %L)) $$, repeat('x', 65537)),
  '22023', null, 'a result snapshot over 64 KB is refused');
select throws_ok(
  format($$ select pg_temp.save('Builds credit', jsonb_build_object('padding', %L), '{}') $$, repeat('x', 8200)),
  '22023', null, 'an answer snapshot over 8 KB is refused');
select throws_ok(
  format($$ select pg_temp.save(%L, '{}', '{}') $$, repeat('x', 1001)),
  '22023', null, 'a reason over 1,000 characters is refused');
-- at most 20 saves a day: one saved above, 18 more here
reset role;
insert into public.recommendations (student_id, card_id, fit_tier, rules_version, card_data_version)
select pg_temp.student('added'), 'chime-card', 'likely_fit', 'fit-rules v1.3', 'cards-abc' from generate_series(1, 18);
insert into public.recommendations (student_id, card_id, fit_tier, rules_version, card_data_version, created_at)
select pg_temp.student('denied'), 'chime-card', 'likely_fit', 'fit-rules v1.3', 'cards-abc', now() - interval '2 days' from generate_series(1, 30);
set local role authenticated;
select lives_ok($$ select pg_temp.save('Builds credit', '{}', '{}') $$, 'the 20th save in 24 hours goes through');
select throws_ok($$ select pg_temp.save('Builds credit', '{}', '{}') $$,
  '54000', 'save_recommendation: too many saves today', 'the 21st is refused');
select pg_temp.as_student('denied');
select lives_ok($$ select pg_temp.save('Builds credit', '{}', '{}') $$, 'saves older than 24 hours do not count');

-------------------------------------------------------------------------------
-- 4. snooze_reminder: the API's rule. Sent reminders on the 'added' card
-- (due day 28 at first; changed below).
reset role;
create temp table rows (name text primary key, id uuid);
create function pg_temp.sent(p_name text, p_kind text, p_occurrence date, p_follow_up boolean default false) returns void language sql as $$
  with r as (
    insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at, claimed_at, sent_at, attempts, follow_up_at)
    select m.student_id, m.id, p_kind, p_occurrence, now() - interval '3 days', now() - interval '3 days', now() - interval '3 days', 1,
           case when p_follow_up then now() end
    from mine m
    where m.student_id = case when p_kind = 'reapply' then pg_temp.student('denied') else pg_temp.student('added') end
    returning id
  )
  insert into rows select p_name, r.id from r;
$$;
-- the card's payment is due 10 days from today
update public.card_applications set payment_due_day = extract(day from pg_temp.today() + 10)::int
where student_id = pg_temp.student('added');
-- only the sent ones below, so none can clash with a planned one
delete from public.reminders where student_id in (select id from students) and sent_at is null;
select pg_temp.sent('closing', 'statement_closing', pg_temp.today() + 2);
select pg_temp.sent('due', 'payment_due', pg_temp.today() + 4);
select pg_temp.sent('followed', 'statement_closing', pg_temp.today() - 3, true);
select pg_temp.sent('reapply', 'reapply', pg_temp.today() + 60);
grant select on rows to authenticated;
create function pg_temp.r(p_name text) returns uuid language sql as $$
  select id from rows where name = p_name;
$$;
create function pg_temp.snooze(p_name text, p_day date) returns timestamptz language sql as $$
  select (public.snooze_reminder(pg_temp.r(p_name), pg_temp.at9(p_day))).snoozed_until;
$$;

set local role authenticated;
select pg_temp.as_student('added');
select is(pg_temp.snooze('closing', pg_temp.today() + 1), pg_temp.at9(pg_temp.today() + 1),
  'a closing reminder snoozes to tomorrow morning');
select is(pg_temp.snooze('closing', pg_temp.today() + 2), pg_temp.at9(pg_temp.today() + 2),
  'or to its closing day');
select throws_ok(
  $$ select pg_temp.snooze('closing', pg_temp.today() + 3) $$,
  '22023', null, 'but not past the day it closes, though within 45 days');
select lives_ok(
  $$ select public.snooze_reminder(pg_temp.r('closing'), now() + interval '1 minute') $$,
  'a minute from now is accepted, so the API''s "tomorrow" is never refused just after midnight');
select is(pg_temp.snooze('due', pg_temp.today() + 3), pg_temp.at9(pg_temp.today() + 3),
  'a due-date reminder snoozes to the day before it is due');
select throws_ok(
  $$ select pg_temp.snooze('due', pg_temp.today() + 5) $$,
  '22023', null, 'but not past the due date');
select is(pg_temp.snooze('followed', pg_temp.today() + 9), pg_temp.at9(pg_temp.today() + 9),
  'after its follow-up, a closing reminder runs out on the payment due date');
select throws_ok(
  $$ select pg_temp.snooze('followed', pg_temp.today() + 11) $$,
  '22023', null, 'and cannot be snoozed past it');
select pg_temp.as_student('denied');
select is(pg_temp.snooze('reapply', pg_temp.today() + 2), pg_temp.at9(pg_temp.today() + 2),
  'a reapply reminder, with no due date, snoozes 2 days');
select throws_ok(
  $$ select pg_temp.snooze('reapply', pg_temp.today() + 3) $$,
  '22023', null, 'and no further');
reset role;

select * from finish();
rollback;
