-- Created with Claude Code (2026-11-26). Application check-ins: reasons for a
-- student to come back while they wait on an issuer (persona walk, Nov 25:
-- all five simulated students stopped opening Cense between day 1 and day 14,
-- and nothing brought them back). Two new reminder kinds on the existing
-- reminders system, each one email plus the same card in Updates:
--
-- - heard_back: 7 days after the student marked "I applied" with no decision
--   saved, "Heard back yet?", linking to "What did the issuer decide?". If
--   still undecided at day 21, one more. Never a third, never for a decided
--   application (approved or rejected).
-- - letter_check: 10 days after a denial the student is waiting on the
--   issuer's letter for (denial_reason 'no_letter_yet'), "Has your letter
--   come?", linking to the step that records it. Once per application.
--
-- Days count on the student's calendar (their time zone, New York when none
-- is saved), and every email goes at 9:00, as the card reminders do. They
-- obey the same rules as every reminder email (at most one a day, never after
-- unsubscribing, one attempt a day and 3 in all), plus a new setting,
-- profiles.remind_application_updates ("Application updates" in Reminder
-- settings): the three existing switches are all about an approved card's
-- statement, so none of them could hold these. Only to an account whose email
-- is confirmed and that is not deleted.
--
-- Changes:
-- 1. profiles.remind_application_updates (default true); students may change
--    it, like the other switches; changing it re-plans (the profiles trigger).
-- 2. reminders.kind allows 'heard_back' and 'letter_check'.
-- 3. refresh_reminders() plans them. The one from
--    20261025200000_reminder_fixes.sql with one new block, marked NEW. Unsent
--    ones are rebuilt on every refresh, so a decision, "I got my letter", a
--    setting turned off or an unsubscribe removes them. A check-in already
--    sent (or being sent) is never planned again, even if a time zone change
--    moves its day by one. One already more than 6 days past its day is not
--    planned (the claim would never send it).
-- 4. The card_applications trigger also re-plans when denial_reason changes
--    ("Not yet, I'm waiting on the letter" and "I got my letter" change only
--    that) or applied_at does (students cannot change it; the journey tests
--    move it back to fast-forward), and the profiles trigger when
--    remind_application_updates does.
-- 5. claim_due_reminders(): the one from 20261108200000_autopay_payment_type.sql
--    with the new kinds' rules, marked NEW, and one new column back,
--    card_application_id, for the email's links. A new return type, so the
--    function is dropped and made again with the same grants.
-- 6. Applications waiting today are planned once, so the check-ins also reach
--    students who applied before this.
--
-- To back it out: supabase/rollbacks/20261126160000_application_check_ins.down.sql.
-- Applied by hand in the Supabase SQL editor, after every earlier migration.
-- Safe to run again.

-- 1
alter table public.profiles
  add column if not exists remind_application_updates boolean not null default true;
grant update (remind_application_updates) on public.profiles to authenticated;

-- 2
alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders
  add constraint reminders_kind_check check (kind in (
    'statement_closing', 'payment_due', 'check_autopay', 'reapply', 'heard_back', 'letter_check'));

-- 3
create or replace function public.refresh_reminders(p_application_id uuid, p_today date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.card_applications;
  v_profile public.profiles;
  v_tz text;
  v_today date;
  v_set_up date;
  v_first_close date;
  v_close date;
  v_due date;
  v_subscribed boolean;
  -- NEW
  v_start date;
  v_day date;
  v_after int;
begin
  select * into v_app from public.card_applications where id = p_application_id;
  if not found then
    return;
  end if;
  select * into v_profile from public.profiles where student_id = v_app.student_id;
  v_tz := public.reminder_safe_tz(v_profile.time_zone);
  v_today := coalesce(p_today, (now() at time zone v_tz)::date);
  v_subscribed := v_profile.reminders_unsubscribed_at is null;

  -- NEW: the check-ins while the student waits on the issuer. Unsent ones are
  -- rebuilt from the application's status and the student's settings.
  delete from public.reminders
  where card_application_id = p_application_id
    and kind in ('heard_back', 'letter_check')
    and sent_at is null and claimed_at is null;

  if v_subscribed and coalesce(v_profile.remind_application_updates, true) then
    -- "Heard back yet?" 7 and 21 days after applying, while no decision is
    -- saved. Each is planned only when no check-in within 3 days of its day
    -- is left (one sent, or being sent), so there are never more than two.
    if v_app.status = 'applied' and v_app.applied_at is not null then
      v_start := (v_app.applied_at at time zone v_tz)::date;
      foreach v_after in array array[7, 21] loop
        v_day := v_start + v_after;
        if v_day >= v_today - 6
           and not exists (select 1 from public.reminders
                           where card_application_id = v_app.id and kind = 'heard_back'
                             and abs(occurrence - v_day) <= 3) then
          insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
          values (v_app.student_id, v_app.id, 'heard_back', v_day, (v_day + time '09:00') at time zone v_tz)
          on conflict (card_application_id, kind, occurrence) do nothing;
        end if;
      end loop;
    end if;

    -- "Has your letter come?" 10 days after the denial, while the student is
    -- waiting on the issuer's letter. Once per application, ever.
    if v_app.status = 'rejected' and v_app.denial_reason = 'no_letter_yet' and v_app.rejected_at is not null then
      v_day := (v_app.rejected_at at time zone v_tz)::date + 10;
      if v_day >= v_today - 6
         and not exists (select 1 from public.reminders
                         where card_application_id = v_app.id and kind = 'letter_check') then
        insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
        values (v_app.student_id, v_app.id, 'letter_check', v_day, (v_day + time '09:00') at time zone v_tz)
        on conflict (card_application_id, kind, occurrence) do nothing;
      end if;
    end if;
  end if;

  -- unsent card reminders are rebuilt from the current days and settings
  delete from public.reminders
  where card_application_id = p_application_id
    and kind in ('statement_closing', 'payment_due', 'check_autopay')
    and sent_at is null and claimed_at is null;

  -- a reapply reminder only makes sense while the application is rejected
  if v_app.status <> 'rejected' or not v_subscribed then
    delete from public.reminders
    where card_application_id = p_application_id and kind = 'reapply'
      and sent_at is null and claimed_at is null;
  end if;

  if v_app.status <> 'approved' or not v_subscribed then
    return;
  end if;

  if v_app.statement_closing_day is null then
    return;
  end if;

  -- the first statement: the first closing day on or after the card was set up.
  -- It is fixed by the set-up day, not by today, so re-planning never moves it.
  v_set_up := coalesce((v_app.card_set_up_at at time zone v_tz)::date, v_today);
  v_first_close := public.reminder_next_on_day(v_app.statement_closing_day, v_set_up);

  v_close := public.reminder_next_on_day(v_app.statement_closing_day, v_today);
  if coalesce(v_profile.remind_statement_closing, true) then
    insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
    values (v_app.student_id, v_app.id, 'statement_closing', v_close,
            (greatest(v_close - 3, v_today) + time '09:00') at time zone v_tz)
    on conflict (card_application_id, kind, occurrence) do nothing;
  end if;

  -- once per new card, the day after the first statement closes, and only
  -- while autopay is not known to be on. If that day has passed unsent, it
  -- goes today, but never more than 3 days after the close: later, "your
  -- first statement is here" is old news and its due date may have passed.
  -- A card the student already had ('added') never gets it.
  if v_app.source = 'application'
     and coalesce(v_profile.remind_check_autopay, true) and v_app.autopay_status <> 'on'
     and v_first_close >= v_today - 3
     and not exists (select 1 from public.reminders
                     where card_application_id = v_app.id and kind = 'check_autopay') then
    insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
    values (v_app.student_id, v_app.id, 'check_autopay', v_first_close,
            (greatest(v_first_close + 1, v_today) + time '09:00') at time zone v_tz);
  end if;

  -- a new card's first payment due is the one after its first statement
  -- closes; a card the student already had just uses the next due date
  if v_app.payment_due_day is not null and coalesce(v_profile.remind_payment_due, true) then
    v_due := public.reminder_next_on_day(v_app.payment_due_day,
      case when v_app.source = 'application' then greatest(v_today, v_first_close + 1) else v_today end);
    insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
    values (v_app.student_id, v_app.id, 'payment_due', v_due,
            (greatest(v_due - 3, v_today) + time '09:00') at time zone v_tz)
    on conflict (card_application_id, kind, occurrence) do nothing;
  end if;
end;
$$;

-- 4
drop trigger if exists card_applications_refresh_reminders on public.card_applications;
create trigger card_applications_refresh_reminders
  after insert or update of status, statement_closing_day, payment_due_day, autopay_status, denial_reason, applied_at
  on public.card_applications
  for each row execute function public.card_applications_refresh_reminders();

drop trigger if exists profiles_refresh_reminders on public.profiles;
create trigger profiles_refresh_reminders
  after update of time_zone, reminders_unsubscribed_at, remind_statement_closing,
    remind_payment_due, remind_check_autopay, remind_application_updates
  on public.profiles
  for each row execute function public.profiles_refresh_reminders();

-- 5
drop function if exists public.claim_due_reminders(int);

create function public.claim_due_reminders(p_limit int default 50)
returns table (
  reminder_id uuid,
  student_id uuid,
  kind text,
  occurrence date,
  email text,
  card_id text,
  card_name text,
  credit_limit_cents bigint,
  autopay_status text,
  payment_due_day int,
  time_zone text,
  -- NEW
  card_application_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- one claimer at a time; released when this transaction ends
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('cense.claim_due_reminders'));

  return query
  -- the names Postgres knows, read once (reminder_safe_tz's rule, in one pass)
  with zones as materialized (
    select name from pg_catalog.pg_timezone_names
  ),
  -- materialized, so each student's day is worked out once
  student_day as materialized (
    -- each student's time zone and the start of their today and tomorrow
    select p.student_id,
           p.reminders_unsubscribed_at,
           p.remind_statement_closing,
           p.remind_payment_due,
           p.remind_check_autopay,
           -- NEW
           p.remind_application_updates,
           z.tz,
           (now() at time zone z.tz)::date as today,
           ((now() at time zone z.tz)::date)::timestamp at time zone z.tz as today_starts,
           ((now() at time zone z.tz)::date + 1)::timestamp at time zone z.tz as tomorrow_starts
    from public.profiles p
    left join zones n on n.name = p.time_zone
    cross join lateral (select coalesce(n.name, 'America/New_York') as tz) z
  ),
  eligible as (
    -- the due reminder of each student who can get an email today whose
    -- date runs out first
    select distinct on (r.student_id) r.id, r.due_at
    from public.reminders r
    join student_day d on d.student_id = r.student_id
    join public.card_applications a on a.id = r.card_application_id
    where r.sent_at is null
      and r.due_at < d.tomorrow_starts
      and (r.claimed_at is null or r.claimed_at < now() - interval '15 minutes')
      -- one attempt a day; a reminder tried today waits for tomorrow
      and (r.attempted_at is null or r.attempted_at < d.today_starts)
      and r.attempts < 3
      and d.reminders_unsubscribed_at is null
      and case r.kind
            when 'statement_closing' then d.remind_statement_closing
            -- no due-date email while the student says autopay is on
            when 'payment_due' then d.remind_payment_due and a.autopay_status <> 'on'
            -- a new card only, at most 3 days after its first statement closed
            when 'check_autopay' then d.remind_check_autopay and a.autopay_status <> 'on'
              and a.source = 'application' and r.occurrence >= d.today - 3
            -- NEW: the check-ins, with their setting on, at most 6 days late,
            -- the letter one only while the student still waits on the letter,
            -- and only to a confirmed account that is not deleted
            when 'heard_back' then d.remind_application_updates and r.occurrence >= d.today - 6
              and exists (select 1 from auth.users u where u.id = r.student_id
                          and u.email_confirmed_at is not null and u.deleted_at is null)
            when 'letter_check' then d.remind_application_updates and r.occurrence >= d.today - 6
              and a.denial_reason = 'no_letter_yet'
              and exists (select 1 from auth.users u where u.id = r.student_id
                          and u.email_confirmed_at is not null and u.deleted_at is null)
            else true
          end
      -- NEW: "heard back" only while no decision is saved, the letter one
      -- (like reapply) only while it is rejected
      and case r.kind
            when 'heard_back' then a.status = 'applied'
            when 'reapply' then a.status = 'rejected'
            when 'letter_check' then a.status = 'rejected'
            else a.status = 'approved'
          end
      and (r.kind not in ('statement_closing', 'payment_due') or r.occurrence >= d.today)
      -- one email a day: nothing sent today, nothing being sent right now
      and not exists (
        select 1 from public.reminders s
        where s.student_id = r.student_id
          and (s.sent_at >= d.today_starts
               or (s.sent_at is null and s.claimed_at >= now() - interval '15 minutes'))
      )
    -- the last day each reminder can still go out, earliest first: a
    -- closing or due date (dropped after that day), then the first-statement
    -- email (3 days after the close), then the check-ins (NEW: 6 days after
    -- their day), then reapply (it never runs out)
    order by r.student_id,
             case r.kind
               when 'check_autopay' then r.occurrence + 3
               when 'heard_back' then r.occurrence + 6
               when 'letter_check' then r.occurrence + 6
               when 'reapply' then 'infinity'::date
               else r.occurrence
             end,
             r.due_at, r.id
  ),
  picked as (
    select r.id
    from public.reminders r
    where r.id in (select e.id from eligible e)
      and r.sent_at is null
    order by r.due_at, r.id
    limit greatest(p_limit, 0)
    for update of r skip locked
  )
  update public.reminders r
  set claimed_at = now(),
      attempted_at = now(),
      attempts = r.attempts + 1
  from picked, public.card_applications a, student_day d, auth.users u
  where r.id = picked.id
    and a.id = r.card_application_id
    and d.student_id = r.student_id
    and u.id = r.student_id
  returning r.id, r.student_id, r.kind, r.occurrence, u.email::text, a.card_id, a.card_name,
            a.credit_limit_cents, a.autopay_status, a.payment_due_day::int, d.tz,
            -- NEW
            r.card_application_id;
end;
$$;

revoke execute on function public.claim_due_reminders(int) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(int) to service_role;

-- 6
do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.card_applications
    where status = 'applied' or (status = 'rejected' and denial_reason = 'no_letter_yet')
  loop
    perform public.refresh_reminders(v_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
