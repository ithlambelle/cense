-- Created with Claude Code (2026-11-17). Undoes
-- 20261117100000_security_db_limits.sql: no card cap or length checks, the
-- one-statement refresh_all_reminders(), the table grants the earlier
-- migrations made, no issuer click or size limits, and snooze_reminder()
-- bounded only to 45 days. Roll back the app's job.ts change first, or with
-- this: the new job passes p_after, which the old function does not take.
-- Safe to run again.

-- 1a, 1b
drop trigger if exists card_applications_limit_per_student on public.card_applications;
drop function if exists public.card_applications_limit_per_student();
alter table public.card_applications
  drop constraint if exists card_applications_card_id_length,
  drop constraint if exists card_applications_card_name_length;
alter table public.issuer_clicks drop constraint if exists issuer_clicks_card_id_length;

-- 1c, as in 20261023200000_reminders_and_plan_steps.sql and
-- 20261024220000_reminder_sender.sql
drop function if exists public.refresh_all_reminders(uuid, interval);

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

revoke execute on function public.refresh_all_reminders() from public, anon, authenticated;
grant execute on function public.refresh_all_reminders() to service_role;

-- 2. The grants of 20261009010000_create_card_applications.sql and
-- 20261009180000_mvp1_schema.sql. (Supabase's default extras to anon, and
-- delete, are not given back: nothing used them.)
revoke all on table public.card_applications from anon, authenticated;
grant select, insert, update on public.card_applications to authenticated;
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

-- 3
drop trigger if exists issuer_clicks_limit_per_day on public.issuer_clicks;
drop function if exists public.issuer_clicks_limit_per_day();
drop index if exists public.issuer_clicks_student_clicked_idx;
alter table public.quiz_drafts drop constraint if exists quiz_drafts_answers_size;

-- save_recommendation, as in 20261016220000_save_recommendation.sql
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

-- 4. snooze_reminder, as in 20261108210000_in_app_reminders.sql
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

revoke execute on function public.snooze_reminder(uuid, timestamptz) from public, anon;
grant execute on function public.snooze_reminder(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
