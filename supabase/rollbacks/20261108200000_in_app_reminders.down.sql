-- Created with Claude Code (2026-11-08). Back out
-- supabase/migrations/20261108200000_in_app_reminders.sql. Not a migration:
-- it lives outside supabase/migrations so nothing runs it on its own. Run it
-- by hand in the Supabase SQL editor only to undo in-app reminders.
--
-- Drops the four student functions and the follow-up function, the two
-- checks and the four columns (read, snooze, dismiss and follow-up state is
-- lost). Deploy the app without the Updates screen first: its routes call
-- these functions. One transaction: it applies whole or not at all.

begin;

drop function if exists public.raise_reminder_follow_ups(date);
drop function if exists public.mark_reminders_read();
drop function if exists public.dismiss_reminder(uuid);
drop function if exists public.snooze_reminder(uuid, timestamptz);

alter table public.reminders
  drop constraint if exists reminders_follow_up_statement_only,
  drop constraint if exists reminders_in_app_after_sent,
  drop column if exists follow_up_at,
  drop column if exists dismissed_at,
  drop column if exists snoozed_until,
  drop column if exists read_at;

commit;
