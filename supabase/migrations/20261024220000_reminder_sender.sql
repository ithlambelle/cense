-- The reminder sender (US-08): the functions the daily cron job uses to send
-- reminder emails, and the one the unsubscribe link uses.
--
-- The cron job (GET /api/v1/cron/reminders, service role) runs
-- refresh_all_reminders(), then claim_due_reminders(), sends each claimed
-- reminder through Resend, and calls mark_reminder_sent() on success or
-- release_reminder_claim() on failure. All four are for the service role only.
--
-- Claim rules:
-- - Due means the reminder's day has come on the student's calendar
--   (due_at falls before tomorrow in their time zone). Vercel Hobby runs the
--   job once a day at some point in the 13:00 UTC hour, which is before 9:00
--   for students west of Eastern and, in winter, for Eastern too, so waiting
--   for due_at itself would send those a day late.
-- - At most one reminder email a day per student: a student who already had
--   one sent today on their calendar, or has one being sent right now, is
--   skipped. Their earliest due reminder goes first; the rest wait a day.
-- - Never to a student who unsubscribed, or for a kind they turned off.
-- - Only while the card still fits: approved for the card reminders,
--   rejected for reapply, autopay not on for the autopay check.
-- - Never about a closing or due date that has already passed.
-- - A claim older than 15 minutes that was never marked sent is stuck (the
--   job died mid-send) and can be claimed again; after 3 attempts the
--   reminder is given up on.
--
-- One claimer at a time (an advisory lock), so two overlapping runs can never
-- send a student two emails in a day, plus "for update skip locked" so a row
-- another transaction holds is skipped, never waited on or claimed twice.
--
-- unsubscribe_reminders() is what the signed link in every email calls. It
-- sets reminders_unsubscribed_at once; the profiles trigger then removes the
-- student's unsent reminders.
--
-- Applied by hand in the Supabase SQL editor, after
-- 20261023200000_reminders_and_plan_steps.sql. Safe to run again.

-- the due reminders to send now, at most one per student, each claimed
-- (claimed_at = now(), attempts + 1) and returned with what its email needs
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
  with student_day as (
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
    cross join lateral (select public.reminder_safe_tz(p.time_zone) as tz) z
  ),
  eligible as (
    -- the earliest due reminder of each student who can get an email today
    select distinct on (r.student_id) r.id, r.due_at
    from public.reminders r
    join student_day d on d.student_id = r.student_id
    join public.card_applications a on a.id = r.card_application_id
    where r.sent_at is null
      and r.due_at < d.tomorrow_starts
      and (r.claimed_at is null or r.claimed_at < now() - interval '15 minutes')
      and r.attempts < 3
      and d.reminders_unsubscribed_at is null
      and case r.kind
            when 'statement_closing' then d.remind_statement_closing
            when 'payment_due' then d.remind_payment_due
            when 'check_autopay' then d.remind_check_autopay and a.autopay_status <> 'on'
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
    order by r.student_id, r.due_at, r.id
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

-- the email went out: set sent_at once (the reminder then shows in the app)
create or replace function public.mark_reminder_sent(p_reminder_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.reminders
    set sent_at = now()
    where id = p_reminder_id and sent_at is null and claimed_at is not null
    returning 1
  )
  select exists (select 1 from marked);
$$;

-- the email failed: make the reminder claimable again straight away. The
-- claim is backdated past the 15-minute window (to 16 minutes ago) rather than cleared, so
-- refresh_reminders (which rebuilds unclaimed rows) leaves it alone and its
-- attempts keep counting toward the cap of 3.
create or replace function public.release_reminder_claim(p_reminder_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reminders
  set claimed_at = now() - interval '16 minutes'
  where id = p_reminder_id and sent_at is null and claimed_at is not null;
$$;

-- the unsubscribe link: stop every reminder email for this student. The first
-- time is kept. True when the student exists.
create or replace function public.unsubscribe_reminders(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.profiles
    set reminders_unsubscribed_at = coalesce(reminders_unsubscribed_at, now())
    where student_id = p_student_id
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- who can run what: the service role only (the cron and unsubscribe routes).
-- Supabase gives anon and authenticated execute on new functions by default.
revoke execute on function public.claim_due_reminders(int) from public, anon, authenticated;
revoke execute on function public.mark_reminder_sent(uuid) from public, anon, authenticated;
revoke execute on function public.release_reminder_claim(uuid) from public, anon, authenticated;
revoke execute on function public.unsubscribe_reminders(uuid) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(int) to service_role;
grant execute on function public.mark_reminder_sent(uuid) to service_role;
grant execute on function public.release_reminder_claim(uuid) to service_role;
grant execute on function public.unsubscribe_reminders(uuid) to service_role;
grant execute on function public.refresh_all_reminders() to service_role;
