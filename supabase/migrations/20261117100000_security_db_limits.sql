-- Created with Claude Code (2026-11-17). Database limits from the external
-- security audit of a8fe7d4. Each part closes a way a student, holding only
-- their own session and the public key (both in their browser), could go
-- around the app's API straight to the Data API.
--
-- 1. (High) One student could stop the daily reminder job for everyone. They
--    could insert thousands of card_applications rows directly (nothing
--    capped them, and students cannot delete rows, so they stay). The job's
--    refresh_all_reminders() re-planned every card in one statement, which
--    then ran past the 8-second statement limit and was rolled back whole, so
--    nobody's next reminders were scheduled. Three fixes:
--    a. card_applications_limit_per_student: at most 25 card records per
--       student, counting every status. A real student tracks one to three
--       cards; the catalog has 53 cards in all, and 25 still leaves room for
--       a student who applies, is denied and tries again many times. Over
--       the cap the insert fails with 54000 (the API answers 503 as for any
--       database error; no real student gets there).
--    b. card_id at most 100 characters and card_name at most 160, the same
--       limits as the API (createApplicationSchema in
--       web/src/lib/api/schemas.ts). issuer_clicks.card_id gets the same 100.
--       If adding a check fails, a saved row is longer; find it with
--       select id from card_applications where char_length(card_name) > 160.
--    c. refresh_all_reminders(p_after, p_budget) works one student at a time
--       and stops after about p_budget (3 seconds), answering the last
--       student it finished. The job calls it again from there until it
--       answers null (web/src/lib/reminders/job.ts), so each call is its own
--       statement, well inside the limit, and work already done is kept.
--       Each card is still re-planned by refresh_reminders() exactly as
--       before, and one card that fails is still skipped with a warning.
-- 2. (Low) Students could write every column of their own card_applications
--    and profiles rows, including source, status, card_set_up_at,
--    updated_at, rejected_at and time_zone. Now they get only the columns the
--    app writes (the routes under web/src/app/api/v1), as already done for
--    reminders and bank_links: revoke everything, then grant those columns.
--    card_applications: read all; add with student_id, card_id, card_name,
--    source, status, credit_limit_cents, applied_at (POST /applications);
--    change status, credit_limit_cents, spend_limit_cents, denial_reason,
--    denial_reason_note, statement_closing_day, payment_due_day,
--    autopay_status, autopay_updated_at, autopay_payment_type (PATCH
--    /applications/{id}). profiles: read all; change
--    remind_statement_closing, remind_payment_due, remind_check_autopay,
--    reminders_unsubscribed_at (PATCH /me/reminder-settings) and
--    analytics_opted_out_at (PATCH /me/privacy). No insert: a new student's
--    profile is made by handle_new_student(). No delete on either (there was
--    never a delete policy; now the privilege is gone too). time_zone is not
--    writable: nothing in the app saves one yet. Grant it when something does.
-- 3. (Low) Unbounded writes. issuer_clicks: at most 50 clicks per student in
--    any 24 hours (a real student clicks a few times), and clicked_at is
--    always the time of the insert, so the window cannot be dodged.
--    quiz_drafts.answers: at most 8 KB as JSON text (a full draft is about
--    260 bytes; the API's schema allows nothing larger than about 400).
--    save_recommendation(): answer snapshot at most 8 KB, result snapshot
--    at most 64 KB (the largest today, all 53 cards, is about 4.2 KB),
--    reason at most 1,000 characters, card id and both versions at most 100.
--    Sizes are measured on the JSON text, not pg_column_size, which a
--    repetitive value could shrink by compression.
-- 4. (Low) snooze_reminder() let a direct call snooze up to 45 days, past the
--    reminder's due date. It now enforces the API's rule (snoozeOptions in
--    web/src/lib/reminders/in-app.ts): the snooze day, on the student's
--    calendar, is after today and not after the date the reminder runs out on
--    (the closing date, or after its follow-up the payment due; the payment
--    due date; for the first-statement email, the payment due after the
--    first close). A reminder with no such date (reapply, or no due day saved)
--    can be snoozed at most 2 days. A refusal is 22023, which the API already
--    answers as 409 past_due.
--
-- To back it out: supabase/rollbacks/20261117100000_security_db_limits.down.sql.
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production. Deploy the app change (job.ts) with or after it: the old job's
-- call with no arguments still works, but refreshes only the first 3 seconds'
-- worth of students. Safe to run again.

-- 1a. At most 25 card records per student.
create or replace function public.card_applications_limit_per_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- one insert per student at a time, so two at once cannot both pass at 24
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('cense.card_applications_limit'),
    pg_catalog.hashtext(new.student_id::text));
  if (select count(*) from public.card_applications where student_id = new.student_id) >= 25 then
    raise exception 'a student can track at most 25 cards' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists card_applications_limit_per_student on public.card_applications;
create trigger card_applications_limit_per_student
  before insert on public.card_applications
  for each row execute function public.card_applications_limit_per_student();

-- 1b. The API's length limits.
alter table public.card_applications
  drop constraint if exists card_applications_card_id_length,
  drop constraint if exists card_applications_card_name_length;
alter table public.card_applications
  add constraint card_applications_card_id_length check (char_length(card_id) <= 100),
  add constraint card_applications_card_name_length check (char_length(card_name) <= 160);

alter table public.issuer_clicks drop constraint if exists issuer_clicks_card_id_length;
alter table public.issuer_clicks
  add constraint issuer_clicks_card_id_length check (char_length(card_id) <= 100);

-- 1c. A batch of students per call. The return type changes from void, so
-- the old function is dropped and made again, with the same grants.
drop function if exists public.refresh_all_reminders();

create or replace function public.refresh_all_reminders(
  p_after uuid default null,
  p_budget interval default interval '3 seconds'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_student uuid;
  v_id uuid;
begin
  -- students in id order, starting after p_after
  for v_student in
    select distinct a.student_id from public.card_applications a
    where a.status in ('approved', 'rejected')
      and (p_after is null or a.student_id > p_after)
    order by a.student_id
  loop
    for v_id in
      select a.id from public.card_applications a
      where a.student_id = v_student and a.status in ('approved', 'rejected')
    loop
      begin
        perform public.refresh_reminders(v_id);
      exception when others then
        -- one bad card must not stop everyone else's reminders
        raise warning 'refresh_reminders failed for application %: %', v_id, sqlstate;
      end;
    end loop;
    -- out of time: answer where to carry on (at least one student is done)
    if pg_catalog.clock_timestamp() - v_started >= p_budget then
      return v_student;
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.refresh_all_reminders(uuid, interval) from public, anon, authenticated;
grant execute on function public.refresh_all_reminders(uuid, interval) to service_role;

-- 2. Only the columns the app writes.
revoke all on table public.card_applications from anon, authenticated;
grant select on public.card_applications to authenticated;
grant insert (student_id, card_id, card_name, source, status, credit_limit_cents, applied_at)
  on public.card_applications to authenticated;
grant update (status, credit_limit_cents, spend_limit_cents, denial_reason, denial_reason_note,
  statement_closing_day, payment_due_day, autopay_status, autopay_updated_at, autopay_payment_type)
  on public.card_applications to authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (remind_statement_closing, remind_payment_due, remind_check_autopay,
  reminders_unsubscribed_at, analytics_opted_out_at)
  on public.profiles to authenticated;

-- 3. issuer_clicks: at most 50 per student in any 24 hours.
create index if not exists issuer_clicks_student_clicked_idx
  on public.issuer_clicks (student_id, clicked_at);

create or replace function public.issuer_clicks_limit_per_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- the server's time, whatever the client sent
  new.clicked_at := now();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('cense.issuer_clicks_limit'),
    pg_catalog.hashtext(new.student_id::text));
  if (select count(*) from public.issuer_clicks
      where student_id = new.student_id and clicked_at > now() - interval '24 hours') >= 50 then
    raise exception 'too many issuer clicks today' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists issuer_clicks_limit_per_day on public.issuer_clicks;
create trigger issuer_clicks_limit_per_day
  before insert on public.issuer_clicks
  for each row execute function public.issuer_clicks_limit_per_day();

-- 3. quiz_drafts.answers: at most 8 KB.
alter table public.quiz_drafts drop constraint if exists quiz_drafts_answers_size;
alter table public.quiz_drafts
  add constraint quiz_drafts_answers_size check (octet_length(answers::text) <= 8192);

-- 3. save_recommendation: sizes checked first. The rest is unchanged from
-- 20261016220000_save_recommendation.sql.
create or replace function public.save_recommendation(
  p_card_id text,
  p_fit_tier text,
  p_reason text,
  p_rules_version text,
  p_card_data_version text,
  p_answer_snapshot jsonb,
  p_result_snapshot jsonb
)
returns public.recommendations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_row public.recommendations;
begin
  if v_student_id is null then
    raise exception 'save_recommendation needs a signed-in student'
      using errcode = '42501';
  end if;
  if p_rules_version is null or btrim(p_rules_version) = '' then
    raise exception 'save_recommendation needs a rules version'
      using errcode = '22023';
  end if;
  if p_card_data_version is null or btrim(p_card_data_version) = '' then
    raise exception 'save_recommendation needs a card data version'
      using errcode = '22023';
  end if;
  -- NEW: sizes
  if char_length(p_card_id) > 100 or char_length(p_rules_version) > 100
     or char_length(p_card_data_version) > 100 or char_length(p_reason) > 1000 then
    raise exception 'save_recommendation: a text field is too long'
      using errcode = '22023';
  end if;
  if octet_length(p_answer_snapshot::text) > 8192 or octet_length(p_result_snapshot::text) > 65536 then
    raise exception 'save_recommendation: a snapshot is too large'
      using errcode = '22023';
  end if;

  insert into public.recommendations
    (student_id, card_id, fit_tier, reason, rules_version, card_data_version, answer_snapshot, result_snapshot)
  values
    (v_student_id, p_card_id, p_fit_tier, p_reason, p_rules_version, p_card_data_version, p_answer_snapshot, p_result_snapshot)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.save_recommendation(text, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_recommendation(text, text, text, text, text, jsonb, jsonb) to authenticated;

-- 4. snooze_reminder: the API's rule, not only a bound. Changes from
-- 20261108210000_in_app_reminders.sql are marked NEW.
create or replace function public.snooze_reminder(p_reminder_id uuid, p_until timestamptz)
returns public.reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_row public.reminders;
  v_due_day int;
  v_tz text;
  v_today date;
  v_day date;
  v_deadline date;
begin
  if v_student_id is null then
    raise exception 'snooze_reminder needs a signed-in student' using errcode = '42501';
  end if;
  select * into v_row from public.reminders
  where id = p_reminder_id and student_id = v_student_id
  for update;
  if not found then
    raise exception 'reminder not found' using errcode = 'P0002';
  end if;
  if v_row.sent_at is null then
    raise exception 'that reminder has not been sent yet' using errcode = '55000';
  end if;
  if v_row.dismissed_at is not null or v_row.acted_at is not null then
    raise exception 'that reminder is closed' using errcode = '55000';
  end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '45 days' then
    raise exception 'pick a time from now to 45 days out' using errcode = '22023';
  end if;

  -- NEW: the snooze day, on the student's calendar, is after today and not
  -- after the date the reminder runs out on (reminderDeadline in
  -- web/src/lib/reminders/in-app.ts); with no such date, at most 2 days out.
  select a.payment_due_day into v_due_day
  from public.card_applications a where a.id = v_row.card_application_id;
  select p.time_zone into v_tz from public.profiles p where p.student_id = v_student_id;
  v_tz := public.reminder_safe_tz(v_tz);
  v_today := (now() at time zone v_tz)::date;
  v_day := (p_until at time zone v_tz)::date;
  v_deadline := case v_row.kind
    when 'statement_closing' then
      case
        when v_row.follow_up_at is null then v_row.occurrence
        when v_due_day is not null then public.reminder_next_on_day(v_due_day, v_row.occurrence + 1)
      end
    when 'payment_due' then v_row.occurrence
    when 'check_autopay' then
      case when v_due_day is not null then public.reminder_next_on_day(v_due_day, v_row.occurrence + 1) end
  end;
  if v_day <= v_today or v_day > coalesce(v_deadline, v_today + 2) then
    raise exception 'pick a day after today and not past the due date' using errcode = '22023';
  end if;

  update public.reminders set snoozed_until = p_until
  where id = p_reminder_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.snooze_reminder(uuid, timestamptz) from public, anon;
grant execute on function public.snooze_reminder(uuid, timestamptz) to authenticated;

-- the trigger functions are for the triggers only
revoke execute on function public.card_applications_limit_per_student() from public, anon, authenticated;
revoke execute on function public.issuer_clicks_limit_per_day() from public, anon, authenticated;
notify pgrst, 'reload schema';
