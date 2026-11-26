-- Created with Claude Code (2026-11-26). Undoes
-- 20261126140500_follow_up_skips_full_autopay.sql: puts back
-- raise_reminder_follow_ups() exactly as 20261108210000_in_app_reminders.sql
-- made it, so a card with full-balance autopay gets the follow-up again. The
-- grants are kept. Safe to run again.

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
