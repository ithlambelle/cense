-- Created with Claude Code (2026-11-17). Undoes
-- 20261117120000_auth_throttle.sql: no app-level limits on the sign-in
-- routes. Roll the app back first: its routes call claim_auth_attempt(), and
-- without it they log a database error and let every try through.
drop function if exists public.claim_auth_attempt(text, text, text);
drop table if exists public.auth_throttle_events;
