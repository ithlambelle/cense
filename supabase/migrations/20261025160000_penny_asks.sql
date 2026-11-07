-- Ask Penny's daily limits (S34; Ben, 2026-10-25): a student may type 20
-- questions a day, and all students together 300. A tapped question shows a
-- checked answer with no model call, so it is never counted.
--
-- penny_asks: one row per typed question that went to the model, holding who
-- and when, never the question. Students cannot read or write it; the API
-- calls claim_penny_ask(), which checks both limits and records the question
-- in one step, so the browser cannot skip the count. Rows older than two days
-- have no use and are deleted as new questions arrive.
--
-- "A day" is the student's calendar day in their profile's time zone, and the
-- team's (America/New_York) for the shared limit, so "today" in Penny's reply
-- means what the student reads it as.

create table public.penny_asks (
  id bigint generated always as identity primary key,
  student_id uuid not null references auth.users (id) on delete cascade,
  asked_at timestamptz not null default now()
);

create index penny_asks_student_asked_idx on public.penny_asks (student_id, asked_at);
create index penny_asks_asked_idx on public.penny_asks (asked_at);

-- No grants: only claim_penny_ask() (security definer) touches the table.
revoke all on table public.penny_asks from anon, authenticated;
alter table public.penny_asks enable row level security;

-- 'ok' when the question may go to the model (and it is now counted),
-- 'student_limit' or 'daily_limit' when it may not.
create or replace function public.claim_penny_ask()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_tz text;
  v_student_day_start timestamptz;
  v_team_day_start timestamptz;
begin
  if v_student_id is null then
    raise exception 'claim_penny_ask needs a signed-in student' using errcode = '42501';
  end if;

  -- One claim at a time, so two questions sent together cannot both take the
  -- last place.
  perform pg_advisory_xact_lock(hashtext('public.claim_penny_ask'));

  delete from public.penny_asks where asked_at < now() - interval '2 days';

  select time_zone into v_tz from public.profiles where student_id = v_student_id;
  v_tz := public.reminder_safe_tz(v_tz);
  v_student_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_team_day_start := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';

  if (
    select count(*) from public.penny_asks
    where student_id = v_student_id and asked_at >= v_student_day_start
  ) >= 20 then
    return 'student_limit';
  end if;

  if (select count(*) from public.penny_asks where asked_at >= v_team_day_start) >= 300 then
    return 'daily_limit';
  end if;

  insert into public.penny_asks (student_id) values (v_student_id);
  return 'ok';
end;
$$;

revoke execute on function public.claim_penny_ask() from public, anon;
grant execute on function public.claim_penny_ask() to authenticated;
