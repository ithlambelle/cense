-- Created with Claude Code (2026-11-25). Undoes
-- 20261121210000_keyed_auth_throttle.sql: drops claim_auth_attempt_hashed().
-- Run it only after the app is back on code that calls claim_auth_attempt()
-- and after 20261121210100_retire_unkeyed_auth_throttle.down.sql, or the
-- deployed app loses its sign-in limits and refuses code and password
-- sign-ins (503). Rows the keyed function wrote stay in auth_throttle_events
-- until the daily purge deletes them (within about 2 days). Safe to run again.

drop function if exists public.claim_auth_attempt_hashed(text, text, text, text);
