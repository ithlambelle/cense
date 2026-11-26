-- Created with Claude Code (2026-11-25). Undoes
-- 20261121210100_retire_unkeyed_auth_throttle.sql: the app's server may call
-- the unkeyed claim_auth_attempt() again. Run this BEFORE rolling the app back
-- to code that calls claim_auth_attempt(), or that code loses its sign-in
-- limits and refuses code and password sign-ins (503). The records the
-- migration deleted are not restored; counts simply start again. Safe to run
-- again.

grant execute on function public.claim_auth_attempt(text, text, text) to service_role;
