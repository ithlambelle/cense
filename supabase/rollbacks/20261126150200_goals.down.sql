-- Created with Claude Code (2026-11-26). Backs out 20261126150200_goals.sql.
-- Roll the app back first: the current app reads and writes goals on Pick a
-- goal and Your plan. Deletes every saved goal. A set-aside already written by
-- an accepted plan stays on bank_links, where the student can still change it
-- on Your money. Safe to run again.

drop table if exists public.goals;
