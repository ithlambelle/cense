-- Created with Claude Code (2026-11-19). First sign-in (Flow 1, Figma
-- 821:8408): profiles.welcomed_at is when the student finished the welcome
-- (W1 and W2) by tapping "Let's go". Null means they have not seen it yet,
-- and /start sends them to it instead of their usual screen
-- (web/src/lib/first-login.ts). The app sets it before it moves the student
-- on (PUT /api/v1/me/welcome), so the welcome never comes round again.
--
-- Every student who already exists when this runs is marked as welcomed
-- (now), so only students who sign up afterwards see the welcome. The column
-- and that backfill happen together, once: run again, nothing changes, so a
-- student who signed up in between still gets their welcome. The backfill
-- also moves each profile's updated_at, which nothing reads; it does not
-- re-plan reminders (that trigger watches only the reminder columns).
--
-- Students already read their own profile and may change only the columns
-- 20261117100000_security_db_limits.sql granted (part 2); welcomed_at joins
-- them. Row level security still limits each student to their own row. A
-- student could set it back to null through the Data API, which only shows
-- them the welcome again.
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production, BEFORE the app change that reads it is deployed. If the app goes
-- out first, /start cannot read the column and sends everyone to their usual
-- screen, so no one is stuck; the welcome just does not show until this runs.
-- Safe to run again. To back it out:
-- supabase/rollbacks/20261119100000_profiles_welcomed_at.down.sql.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'welcomed_at'
  ) then
    alter table public.profiles add column welcomed_at timestamptz;
    update public.profiles set welcomed_at = now();
  end if;
end;
$$;

grant update (welcomed_at) on public.profiles to authenticated;
