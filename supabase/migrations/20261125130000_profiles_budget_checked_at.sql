-- Created with Claude Code (2026-11-25). Step 3 of the Demo Day flow, "Looks
-- right?": right after Penny reads a new bank, the student sees last month
-- and confirms it. profiles.budget_checked_at is when they last tapped Looks
-- right (PUT /api/v1/me/budget-check). Null means they have not checked it
-- yet; Home's next step (priority rule 2, "Check your budget") reads it.
--
-- No backfill: a student who linked a bank before this has not seen the
-- check, so it stays null and Home can ask them once.
--
-- Students already read their own profile and may change only the columns
-- 20261117100000_security_db_limits.sql granted (part 2); budget_checked_at
-- joins them. Row level security still limits each student to their own row.
-- A student who sets it back to null through the Data API is only asked to
-- check their budget again.
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production, BEFORE the app change that writes it is deployed. If the app
-- goes out first, Looks right answers with an error and the student stays on
-- the screen; nothing else breaks. Safe to run again. To back it out:
-- supabase/rollbacks/20261125130000_profiles_budget_checked_at.down.sql.

alter table public.profiles add column if not exists budget_checked_at timestamptz;

grant update (budget_checked_at) on public.profiles to authenticated;
