-- Created with Claude Code (2026-11-08). Card setup and autopay (US-10, Figma
-- Design Edits, Flow C 477:1493).
--
-- 1. card_applications.autopay_payment_type: what the student said their
--    autopay pays at the issuer (I3 "Did you turn on autopay?"):
--    'statement_balance', 'minimum' or 'fixed_amount'. Null when autopay is
--    not on, or when it was saved before this column (Home's star). Only the
--    type is kept, never an amount. The existing column grants (select,
--    insert, update to authenticated) and the row policies cover it.
-- 2. plan_steps: 'spend_limit' joins the first-month steps (Home's and the
--    setup list's "Set a spend limit" star). 'planned_purchase' stays valid so
--    rows already saved are kept.
-- 3. claim_due_reminders: the due-date email (payment_due) is not sent while
--    the card's autopay is on (Ben, Nov 4: when autopay is on, all due-date
--    notifications are off). The rest of the function is unchanged from
--    20261025200000_reminder_fixes.sql. The unsent row is simply never
--    claimed; once its date passes the claim skips it as before.
--
-- To back it out: supabase/rollbacks/20261108200000_autopay_payment_type.down.sql.
-- Safe to run again.

-- 1
alter table public.card_applications
  add column if not exists autopay_payment_type text;

alter table public.card_applications
  drop constraint if exists card_applications_autopay_payment_type_known;
alter table public.card_applications
  add constraint card_applications_autopay_payment_type_known
    check (autopay_payment_type in ('statement_balance', 'minimum', 'fixed_amount'));

-- a payment type only while autopay is on
alter table public.card_applications
  drop constraint if exists card_applications_autopay_payment_type_needs_on;
alter table public.card_applications
  add constraint card_applications_autopay_payment_type_needs_on
    check (autopay_payment_type is null or autopay_status = 'on');

-- 2
alter table public.plan_steps drop constraint if exists plan_steps_known_step;
alter table public.plan_steps
  add constraint plan_steps_known_step check (
    (plan = 'first_month' and step in ('planned_purchase', 'spend_limit', 'payment_reminder'))
    or (plan = 'denial' and step in (
      'read_letter', 'check_reports', 'pause_applications', 'build_credit', 'reapply'))
  );

-- 3. Changes from 20261025200000 are marked NEW (US-10); older NEW marks are
-- that migration's.
create or replace function public.claim_due_reminders(p_limit int default 50)
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
