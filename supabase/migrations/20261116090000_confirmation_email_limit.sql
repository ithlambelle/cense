-- Created with Claude Code (2026-11-16). A daily limit on reminder
-- confirmation emails, from the Testathon security audit.
--
-- Every save of a card's reminder days changes its updated_at, which is the
-- email's de-duplication key, so a script could save and confirm in a loop
-- and send one email per pair. The emails only reach the student's own inbox,
-- but each one spends the Resend quota that sign-in codes and password
-- resets share, so a loop could stop sign-in emails for everyone.
--
-- confirmation_email_sends: one row per confirmation sent, holding who and
-- when, nothing else. Students cannot read or write it;
-- claim_confirmation_email() checks the limits and records the send in one
-- step. A student may get 5 a day, and all students together 100 a day (the
-- team's day, America/New_York). Past either, the save still succeeds and
-- the email is skipped, as when reminder emails are off. Rows older than two
-- days are deleted as new ones arrive.
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production. Safe to run again.

create table if not exists public.confirmation_email_sends (
  id bigint generated always as identity primary key,
  student_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists confirmation_email_sends_student_idx on public.confirmation_email_sends (student_id, sent_at);
create index if not exists confirmation_email_sends_sent_idx on public.confirmation_email_sends (sent_at);

revoke all on table public.confirmation_email_sends from public, anon, authenticated;
alter table public.confirmation_email_sends enable row level security;

-- true when the email may go out (and it is now counted), false when not.
create or replace function public.claim_confirmation_email()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_day_start timestamptz := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
begin
  if v_student_id is null then
    raise exception 'claim_confirmation_email needs a signed-in student' using errcode = '42501';
  end if;

  -- One claim at a time, so two saves together cannot both take the last place.
  perform pg_advisory_xact_lock(hashtext('public.claim_confirmation_email'));

  delete from public.confirmation_email_sends where sent_at < now() - interval '2 days';

  if (select count(*) from public.confirmation_email_sends
      where student_id = v_student_id and sent_at >= v_day_start) >= 5 then
    return false;
  end if;
  if (select count(*) from public.confirmation_email_sends where sent_at >= v_day_start) >= 100 then
    return false;
  end if;

  insert into public.confirmation_email_sends (student_id) values (v_student_id);
  return true;
end;
$$;

revoke execute on function public.claim_confirmation_email() from public, anon;
grant execute on function public.claim_confirmation_email() to authenticated;
