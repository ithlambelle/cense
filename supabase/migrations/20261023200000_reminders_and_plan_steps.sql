-- MVP2 backend for reminders (C2) and the first-month and denial plans (C3).
--
-- reminders: one row per reminder email. Students never insert them.
-- refresh_reminders() works out the next statement-closing, payment-due and
-- autopay-check reminders from the card's closing and due days and the
-- student's time zone. The daily cron job (service role) calls it, then claims
-- due rows, sends, and sets sent_at. A trigger re-runs it whenever the card's
-- days or status, or the student's reminder settings, change. The one
-- reminder a student picks the date for, reapplying after a denial, goes
-- through create_reapply_reminder(), which checks it. The unique (card, kind,
-- occurrence) means one reminder can never be stored, or sent, twice.
--
-- Reminder rules: statement closing 3 days before the close, payment due 3
-- days before the due date, check autopay the day after the first statement
-- closes. No payment-due reminder comes before the card's first statement has
-- closed (a card set up Nov 1 with close day 12 and due day 9 gets its first
-- one for Dec 9). When the 3-day mark has passed but the date has not, it goes
-- out today. Emails go at 9:00 on the student's calendar; an unknown time zone
-- name falls back to America/New_York.
--
-- plan_steps: one row per finished plan step (a lit star). Undo deletes the
-- row. Autopay is not a step: the plan reads card_applications.autopay_status.
--
-- Both tables point at the student's own card application with a composite
-- foreign key (card_application_id, student_id), so a row can never pair one
-- student with another student's application.

-- lets the composite foreign keys below reference (id, student_id)
alter table public.card_applications
  add constraint card_applications_id_student_key unique (id, student_id);

-- new columns
-- the student's own words about a denial: at most 200 characters, never sent
-- to analytics. card_set_up_at: when the card's closing day was first saved,
-- set by the server, so the first statement can be worked out.
alter table public.card_applications
  add column denial_reason_note text
    check (char_length(denial_reason_note) <= 200),
  add column card_set_up_at timestamptz;

-- existing cards with a closing day count as set up now
update public.card_applications
set card_set_up_at = now()
where statement_closing_day is not null;

-- the server keeps the first time; whatever the client sends is ignored
create or replace function public.set_card_set_up_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.card_set_up_at := case when new.statement_closing_day is not null then now() end;
  else
    new.card_set_up_at := coalesce(old.card_set_up_at,
      case when new.statement_closing_day is not null then now() end);
  end if;
  return new;
end;
$$;

create trigger card_applications_set_card_set_up_at
  before insert or update on public.card_applications
  for each row execute function public.set_card_set_up_at();

-- when the student last opened their updates; reminder settings. Unsubscribing
-- (from the link in every email) stops all reminder emails; each kind can
-- also be turned off on its own.
alter table public.profiles
  add column updates_seen_at timestamptz,
  add column reminders_unsubscribed_at timestamptz,
  add column remind_statement_closing boolean not null default true,
  add column remind_payment_due boolean not null default true,
  add column remind_check_autopay boolean not null default true;

-- reminders
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  card_application_id uuid not null,
  kind text not null check (kind in ('statement_closing', 'payment_due', 'check_autopay', 'reapply')),
  -- the date the reminder is about (the closing, due or reapply date)
  occurrence date not null,
  due_at timestamptz not null,
  claimed_at timestamptz,
  -- send attempts, so the cron job can retry a stuck claim and give up after a few
  attempts smallint not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  -- the student acted on it ("I paid it down"); the only column students can change
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reminders_application_fkey
    foreign key (card_application_id, student_id)
    references public.card_applications (id, student_id) on delete cascade,
  constraint reminders_one_per_occurrence
    unique (card_application_id, kind, occurrence),
  constraint reminders_sent_after_claim
    check (sent_at is null or claimed_at is not null),
  constraint reminders_acted_after_sent
    check (acted_at is null or sent_at is not null)
);

create index reminders_student_idx on public.reminders (student_id);

-- what the cron job looks for: not sent yet, earliest first
create index reminders_due_unsent_idx
  on public.reminders (due_at)
  where sent_at is null;

-- plan_steps
create table public.plan_steps (
  student_id uuid not null references auth.users (id) on delete cascade,
  card_application_id uuid not null,
  plan text not null check (plan in ('first_month', 'denial')),
  step text not null,
  completed_at timestamptz not null default now(),
  primary key (card_application_id, plan, step),
  -- the steps each plan shows; autopay is not a step (it reads autopay_status)
  constraint plan_steps_known_step check (
    (plan = 'first_month' and step in ('planned_purchase', 'payment_reminder'))
    or (plan = 'denial' and step in (
      'read_letter', 'check_reports', 'pause_applications', 'build_credit', 'reapply'))
  ),
  constraint plan_steps_application_fkey
    foreign key (card_application_id, student_id)
    references public.card_applications (id, student_id) on delete cascade
);

create index plan_steps_student_idx on public.plan_steps (student_id);

-- Supabase's default privileges give anon and authenticated every privilege on
-- new tables in public. Take them all back so the grants at the end are the
-- only ones students have (otherwise the update policy would let a student
-- change any column of their reminders, not only acted_at).
revoke all on table public.reminders, public.plan_steps from anon, authenticated;

-- a first-month step needs an approved card, a denial step a rejected one
create or replace function public.check_plan_step_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.card_applications where id = new.card_application_id;
  if (new.plan = 'first_month' and v_status is distinct from 'approved')
     or (new.plan = 'denial' and v_status is distinct from 'rejected') then
    raise exception 'a % plan step needs a % application', new.plan,
      case new.plan when 'first_month' then 'approved' else 'rejected' end
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger plan_steps_check_status
  before insert on public.plan_steps
  for each row execute function public.check_plan_step_status();

-- date rules

-- the card's day in a month; day 31 in a shorter month is its last day
create or replace function public.reminder_day_in_month(p_year int, p_month int, p_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(p_year, p_month, least(
    p_day,
    extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int
  ));
$$;

-- the next date on or after p_from that falls on the card's day
create or replace function public.reminder_next_on_day(p_day int, p_from date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when public.reminder_day_in_month(extract(year from p_from)::int, extract(month from p_from)::int, p_day) >= p_from
      then public.reminder_day_in_month(extract(year from p_from)::int, extract(month from p_from)::int, p_day)
    else public.reminder_day_in_month(
      extract(year from p_from + interval '1 month')::int,
      extract(month from p_from + interval '1 month')::int,
      p_day)
  end;
$$;

-- the student's time zone, or America/New_York when it is empty or not a
-- real time zone name, so one bad profile can never stop reminders
create or replace function public.reminder_safe_tz(p_time_zone text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then p_time_zone
    else 'America/New_York'
  end;
$$;

-- 9:00 on the student's calendar, as an instant
create or replace function public.reminder_due_at(p_day date, p_time_zone text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_day + time '09:00') at time zone public.reminder_safe_tz(p_time_zone);
$$;

-- Make one application's reminders match its card and the student's settings:
-- drop unsent reminders that no longer apply, add the next one of each kind.
-- Sent and claimed rows are never touched.
-- p_today is for tests; everything else leaves it null for the student's today.
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
            public.reminder_due_at(greatest(v_close - 3, v_today), v_tz))
    on conflict (card_application_id, kind, occurrence) do nothing;
  end if;

  -- once per card, the day after the first statement closes, and only while
  -- autopay is not known to be on. If that day has passed unsent, it goes today.
  if coalesce(v_profile.remind_check_autopay, true) and v_app.autopay_status <> 'on'
     and not exists (select 1 from public.reminders
                     where card_application_id = v_app.id and kind = 'check_autopay') then
    insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
    values (v_app.student_id, v_app.id, 'check_autopay', v_first_close,
            public.reminder_due_at(greatest(v_first_close + 1, v_today), v_tz));
  end if;

  -- the first payment due is the one after the first statement closes
  if v_app.payment_due_day is not null and coalesce(v_profile.remind_payment_due, true) then
    v_due := public.reminder_next_on_day(v_app.payment_due_day, greatest(v_today, v_first_close + 1));
    insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
    values (v_app.student_id, v_app.id, 'payment_due', v_due,
            public.reminder_due_at(greatest(v_due - 3, v_today), v_tz))
    on conflict (card_application_id, kind, occurrence) do nothing;
  end if;
end;
$$;

-- every application; the daily cron job calls this before claiming due rows,
-- so each card always has its next cycle scheduled
create or replace function public.refresh_all_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.card_applications where status in ('approved', 'rejected') loop
    begin
      perform public.refresh_reminders(v_id);
    exception when others then
      -- one bad card must not stop everyone else's reminders
      raise warning 'refresh_reminders failed for application %: %', v_id, sqlstate;
    end;
  end loop;
end;
$$;

-- the reminder to reapply after a denial: the student picks the day, at most
-- one per application, from tomorrow to a year out. Picking again replaces it.
create or replace function public.create_reapply_reminder(p_application_id uuid, p_remind_on date)
returns public.reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_app public.card_applications;
  v_tz text;
  v_today date;
  v_row public.reminders;
begin
  if v_student_id is null then
    raise exception 'create_reapply_reminder needs a signed-in student' using errcode = '42501';
  end if;
  select * into v_app from public.card_applications
  where id = p_application_id and student_id = v_student_id;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_app.status <> 'rejected' then
    raise exception 'a reapply reminder needs a rejected application' using errcode = '22023';
  end if;
  select public.reminder_safe_tz(time_zone) into v_tz
  from public.profiles where student_id = v_student_id;
  v_tz := public.reminder_safe_tz(v_tz);
  v_today := (now() at time zone v_tz)::date;
  if p_remind_on is null or p_remind_on <= v_today or p_remind_on > v_today + 366 then
    raise exception 'pick a day from tomorrow to a year from now' using errcode = '22023';
  end if;

  delete from public.reminders
  where card_application_id = p_application_id and kind = 'reapply'
    and sent_at is null and claimed_at is null;

  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at)
  values (v_student_id, p_application_id, 'reapply', p_remind_on, public.reminder_due_at(p_remind_on, v_tz))
  on conflict (card_application_id, kind, occurrence) do nothing
  returning * into v_row;
  if v_row.id is null then
    raise exception 'that reminder was already sent' using errcode = '23505';
  end if;
  return v_row;
end;
$$;

-- re-plan when the card's days, status or autopay change
create or replace function public.card_applications_refresh_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_reminders(new.id);
  return null;
end;
$$;

create trigger card_applications_refresh_reminders
  after insert or update of status, statement_closing_day, payment_due_day, autopay_status
  on public.card_applications
  for each row execute function public.card_applications_refresh_reminders();

-- re-plan every card when the student's time zone or reminder settings change
create or replace function public.profiles_refresh_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.card_applications where student_id = new.student_id loop
    perform public.refresh_reminders(v_id);
  end loop;
  return null;
end;
$$;

create trigger profiles_refresh_reminders
  after update of time_zone, reminders_unsubscribed_at, remind_statement_closing,
    remind_payment_due, remind_check_autopay
  on public.profiles
  for each row execute function public.profiles_refresh_reminders();

-- clear the note along with denial_reason when an application is no longer rejected
create or replace function public.set_rejected_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'rejected' then
    if tg_op = 'INSERT' or old.status is distinct from 'rejected' then
      new.rejected_at = now();
    else
      -- still rejected: keep the original time
      new.rejected_at = coalesce(old.rejected_at, now());
    end if;
  else
    new.rejected_at = null;
    new.denial_reason = null;
    new.denial_reason_note = null;
  end if;
  return new;
end;
$$;

-- who can run what: the scheduling functions are for the cron job and the
-- triggers only; students get create_reapply_reminder
revoke execute on function public.refresh_reminders(uuid, date) from public, anon, authenticated;
revoke execute on function public.refresh_all_reminders() from public, anon, authenticated;
revoke execute on function public.create_reapply_reminder(uuid, date) from public, anon;
grant execute on function public.create_reapply_reminder(uuid, date) to authenticated;
revoke execute on function public.card_applications_refresh_reminders() from public, anon, authenticated;
revoke execute on function public.profiles_refresh_reminders() from public, anon, authenticated;
revoke execute on function public.set_card_set_up_at() from public, anon, authenticated;

-- grants: students read their reminders and mark one acted on; plan steps
-- are added and undone
grant select on public.reminders to authenticated;
grant update (acted_at) on public.reminders to authenticated;
grant select, insert, delete on public.plan_steps to authenticated;

alter table public.reminders enable row level security;
alter table public.plan_steps enable row level security;

create policy "Students can read their own reminders"
  on public.reminders for select to authenticated
  using ((select auth.uid()) = student_id);
create policy "Students can mark their own reminders acted on"
  on public.reminders for update to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);

create policy "Students can read their own plan steps"
  on public.plan_steps for select to authenticated
  using ((select auth.uid()) = student_id);
create policy "Students can complete their own plan steps"
  on public.plan_steps for insert to authenticated
  with check ((select auth.uid()) = student_id);
create policy "Students can undo their own plan steps"
  on public.plan_steps for delete to authenticated
  using ((select auth.uid()) = student_id);
