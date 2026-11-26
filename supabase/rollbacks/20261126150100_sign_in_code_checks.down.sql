-- Created with Claude Code (2026-11-26). Undoes
-- 20261126150100_sign_in_code_checks.sql: drops auth_code_check(). Run it
-- only after the app is back on code that does not call it, or the deployed
-- app refuses every code check (503). Its rows in auth_throttle_events stay
-- until the daily purge deletes them (within about 2 days). Safe to run again.

drop function if exists public.auth_code_check(text, text, text, integer);
