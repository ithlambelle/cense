-- Created with Claude Code (2026-11-25). Backs out
-- 20261125130000_profiles_budget_checked_at.sql. Roll the app back first:
-- the current app writes the column on Looks right. Drops when each student
-- last checked their budget, so Home asks them again once it is re-applied.

revoke update (budget_checked_at) on public.profiles from authenticated;
alter table public.profiles drop column if exists budget_checked_at;
