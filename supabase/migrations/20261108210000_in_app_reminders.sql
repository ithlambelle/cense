-- Created with Claude Code (2026-11-08). In-app reminders (US-08, Flow B on
-- the Design Edits board, panel 477:1183): after a reminder email goes out,
-- the same reminder shows in Updates as a card the student can act on,
-- snooze or dismiss for the billing cycle, and one follow-up comes 2 days
-- after a statement closes if the student has not marked it paid.
--
-- Four columns on reminders, all empty until the email is sent:
-- - read_at: the student marked their updates read ("Mark all read").
-- - snoozed_until: the card is out of the way until then (tomorrow at 9:00,
--   in 2 days, or the day before it is due, on the student's calendar).
-- - dismissed_at: hidden for the rest of this billing cycle. Each cycle is
--   its own row (unique card, kind and occurrence), so the next statement's
--   reminder starts fresh.
-- - follow_up_at: when the follow-up ("Time to pay off your card") came, for
--   a statement-closing reminder only. Set once, so there is one follow-up.
--
-- Students change these only through the functions below, which check the
-- reminder is theirs and sent, never the columns themselves. The daily cron
-- job (service role) calls raise_reminder_follow_ups(), which respects snooze
-- and dismiss and skips any one row that fails rather than stopping the job.
--
-- To back it out: supabase/rollbacks/20261108210000_in_app_reminders.down.sql.
-- Applied by hand in the Supabase SQL editor, after
-- 20261108200000_autopay_payment_type.sql. Safe to run again.

alter table public.reminders
  add column if not exists read_at timestamptz,
  add column if not exists snoozed_until timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists follow_up_at timestamptz;

alter table public.reminders
  drop constraint if exists reminders_in_app_after_sent,
  drop constraint if exists reminders_follow_up_statement_only;

-- the in-app card exists only once its email went out
alter table public.reminders
  add constraint reminders_in_app_after_sent check (
    sent_at is not null
    or (read_at is null and snoozed_until is null and dismissed_at is null and follow_up_at is null)
  ),
  add constraint reminders_follow_up_statement_only check (
    follow_up_at is null or kind = 'statement_closing'
  );

-- Snooze one of the student's own sent reminders until p_until. The API works
-- out p_until from the choice (tomorrow, in 2 days, the day before it is due)
-- on the student's calendar and checks it is not past the due date; this
-- checks it is in the future and within 45 days (no card cycle is longer).
-- A reminder that was dismissed or marked paid cannot be snoozed.
create or replace function public.snooze_reminder(p_reminder_id uuid, p_until timestamptz)
returns public.reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_row public.reminders;
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
  -- Only a bound here. "Not past the due date" is enforced by the API, which
  -- picks p_until from snoozeOptions (web/src/lib/reminders/in-app.ts) and
  -- refuses any other time with 409 past_due.
  if p_until is null or p_until <= now() or p_until > now() + interval '45 days' then
    raise exception 'pick a time from now to 45 days out' using errcode = '22023';
  end if;
  update public.reminders set snoozed_until = p_until
  where id = p_reminder_id
  returning * into v_row;
  return v_row;
end;
$$;

-- Hide one of the student's own sent reminders for the rest of this billing
-- cycle. The first time is kept; a snooze on it is cleared.
create or replace function public.dismiss_reminder(p_reminder_id uuid)
returns public.reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_row public.reminders;
begin
  if v_student_id is null then
    raise exception 'dismiss_reminder needs a signed-in student' using errcode = '42501';
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
  update public.reminders
  set dismissed_at = coalesce(dismissed_at, now()),
      snoozed_until = null
  where id = p_reminder_id
  returning * into v_row;
  return v_row;
end;
$$;

-- "Mark all read": every sent reminder of the student's that is not read
-- since it last came up (sent, back from a snooze, or followed up). Answers
-- how many were marked.
create or replace function public.mark_reminders_read()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_count int;
begin
  if v_student_id is null then
    raise exception 'mark_reminders_read needs a signed-in student' using errcode = '42501';
  end if;
  update public.reminders
  set read_at = now()
  where student_id = v_student_id
    and sent_at is not null
    and (read_at is null
         or read_at < greatest(sent_at,
                               coalesce(follow_up_at, sent_at),
                               case when snoozed_until <= now() then snoozed_until else sent_at end));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The follow-up, for the daily cron job: 2 days after a statement closes (on
-- the student's calendar), a statement-closing reminder whose email was sent
-- and that the student has not marked paid, dismissed, or snoozed past now
-- gets follow_up_at, once. Only while the card is approved, the student is
-- subscribed and has statement reminders on, and the payment due date (when
-- the card has one) has not passed. A snoozed one waits and is followed up
-- the first run after the snooze ends. Each reminder is followed up on its
-- own, so one that fails is skipped with a warning and the rest go on.
-- p_today is for tests; the job leaves it null for each student's today.
create or replace function public.raise_reminder_follow_ups(p_today date default null)
returns table (raised int, skipped int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_raised int := 0;
  v_skipped int := 0;
  v_today date;
  v_due date;
begin
  for v_row in
    with zones as materialized (
      select name from pg_catalog.pg_timezone_names
    )
    select r.id, r.occurrence, a.payment_due_day,
           coalesce(n.name, 'America/New_York') as tz
    from public.reminders r
    join public.card_applications a on a.id = r.card_application_id
    join public.profiles p on p.student_id = r.student_id
    left join zones n on n.name = p.time_zone
    where r.kind = 'statement_closing'
      and r.sent_at is not null
      and r.follow_up_at is null
      and r.acted_at is null
      and r.dismissed_at is null
      and (r.snoozed_until is null or r.snoozed_until <= now())
      and a.status = 'approved'
      and p.reminders_unsubscribed_at is null
      and p.remind_statement_closing
      -- a cheap first cut; the exact day is checked per row below
      and r.occurrence <= (now() at time zone 'UTC')::date
  loop
    begin
      v_today := coalesce(p_today, (now() at time zone v_row.tz)::date);
      if v_today < v_row.occurrence + 2 then
        continue;
      end if;
      -- the payment due after this statement closes
      if v_row.payment_due_day is not null then
        v_due := public.reminder_next_on_day(v_row.payment_due_day, v_row.occurrence + 1);
        if v_today > v_due then
          continue;
        end if;
      elsif v_today > v_row.occurrence + 25 then
        -- no due day saved: stop once a usual grace period has passed
        continue;
      end if;
      update public.reminders
      set follow_up_at = now()
      where id = v_row.id and follow_up_at is null;
      if found then
        v_raised := v_raised + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      raise warning 'raise_reminder_follow_ups skipped reminder %: %', v_row.id, sqlstate;
    end;
  end loop;
  raised := v_raised;
  skipped := v_skipped;
  return next;
end;
$$;

-- who can run what. Supabase gives anon and authenticated execute on new
-- functions by default: take it back, then give students the three that
-- check auth.uid(), and the cron job (service role) the follow-ups.
revoke execute on function public.snooze_reminder(uuid, timestamptz) from public, anon;
revoke execute on function public.dismiss_reminder(uuid) from public, anon;
revoke execute on function public.mark_reminders_read() from public, anon;
revoke execute on function public.raise_reminder_follow_ups(date) from public, anon, authenticated;
grant execute on function public.snooze_reminder(uuid, timestamptz) to authenticated;
grant execute on function public.dismiss_reminder(uuid) to authenticated;
grant execute on function public.mark_reminders_read() to authenticated;
grant execute on function public.raise_reminder_follow_ups(date) to service_role;
