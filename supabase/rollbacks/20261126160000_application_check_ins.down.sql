-- Created with Claude Code (2026-11-26). Undoes
-- 20261126160000_application_check_ins.sql: deletes every heard_back and
-- letter_check reminder (sent ones too, so the old kind check fits), puts
-- refresh_reminders() back as 20261025200000_reminder_fixes.sql made it and
-- claim_due_reminders() as 20261108200000_autopay_payment_type.sql made it
-- (with its grants), puts both triggers back on their old columns, and drops
-- profiles.remind_application_updates. Safe to run again.

delete from public.reminders where kind in ('heard_back', 'letter_check');
alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders
  add constraint reminders_kind_check check (kind in ('statement_closing', 'payment_due', 'check_autopay', 'reapply'));

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
begin
  select * into v_app from public.card_applications where id = p_application_id;
  if not found then
    return;
  end if;
  select * into v_profile from public.profiles where student_id = v_app.student_id;
  v_tz := public.reminder_safe_tz(v_profile.time_zone);
  v_today := coalesce(p_today, (now() at time zone v_tz)::date);
  v_subscribed := v_profile.reminders_unsubscribed_at is null;

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

drop trigger if exists card_applications_refresh_reminders on public.card_applications;
create trigger card_applications_refresh_reminders
  after insert or update of status, statement_closing_day, payment_due_day, autopay_status
  on public.card_applications
  for each row execute function public.card_applications_refresh_reminders();

drop trigger if exists profiles_refresh_reminders on public.profiles;
create trigger profiles_refresh_reminders
  after update of time_zone, reminders_unsubscribed_at, remind_statement_closing,
    remind_payment_due, remind_check_autopay
  on public.profiles
  for each row execute function public.profiles_refresh_reminders();

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
  time_zone text
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
  -- NEW: the names Postgres knows, read once (reminder_safe_tz's rule, in one pass)
  with zones as materialized (
    select name from pg_catalog.pg_timezone_names
  ),
  -- NEW: materialized, so each student's day is worked out once
  student_day as materialized (
    -- each student's time zone and the start of their today and tomorrow
    select p.student_id,
           p.reminders_unsubscribed_at,
           p.remind_statement_closing,
           p.remind_payment_due,
           p.remind_check_autopay,
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
      -- NEW: one attempt a day; a reminder tried today waits for tomorrow
      and (r.attempted_at is null or r.attempted_at < d.today_starts)
      and r.attempts < 3
      and d.reminders_unsubscribed_at is null
      and case r.kind
            when 'statement_closing' then d.remind_statement_closing
            -- NEW (US-10): no due-date email while the student says autopay is on
            when 'payment_due' then d.remind_payment_due and a.autopay_status <> 'on'
            -- NEW: a new card only, at most 3 days after its first statement closed
            when 'check_autopay' then d.remind_check_autopay and a.autopay_status <> 'on'
              and a.source = 'application' and r.occurrence >= d.today - 3
            else true
          end
      and case r.kind when 'reapply' then a.status = 'rejected' else a.status = 'approved' end
      and (r.kind not in ('statement_closing', 'payment_due') or r.occurrence >= d.today)
      -- one email a day: nothing sent today, nothing being sent right now
      and not exists (
        select 1 from public.reminders s
        where s.student_id = r.student_id
          and (s.sent_at >= d.today_starts
               or (s.sent_at is null and s.claimed_at >= now() - interval '15 minutes'))
      )
    -- NEW: the last day each reminder can still go out, earliest first: a
    -- closing or due date (dropped after that day), then the first-statement
    -- email (3 days after the close), then reapply (it never runs out)
    order by r.student_id,
             case r.kind
               when 'check_autopay' then r.occurrence + 3
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
      -- NEW
      attempted_at = now(),
      attempts = r.attempts + 1
  from picked, public.card_applications a, student_day d, auth.users u
  where r.id = picked.id
    and a.id = r.card_application_id
    and d.student_id = r.student_id
    and u.id = r.student_id
  returning r.id, r.student_id, r.kind, r.occurrence, u.email::text, a.card_id, a.card_name,
            a.credit_limit_cents, a.autopay_status, a.payment_due_day::int, d.tz;
end;
$$;

revoke execute on function public.claim_due_reminders(int) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(int) to service_role;

alter table public.profiles drop column if exists remind_application_updates;

notify pgrst, 'reload schema';
