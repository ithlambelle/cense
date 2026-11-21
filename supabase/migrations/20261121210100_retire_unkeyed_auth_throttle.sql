-- Created with Claude Code (2026-11-21). Retires the unkeyed sign-in limit
-- records once the app counts tries with claim_auth_attempt_hashed()
-- (20261121210000_keyed_auth_throttle.sql).
--
-- Applied by hand AFTER the app code that calls claim_auth_attempt_hashed()
-- is deployed: cense-preview first, then production. Run earlier, the
-- deployed app would lose its sign-in limits and refuse code and password
-- sign-ins (503) until the new code is live. Safe to run again.
--
-- 1. The app's server may no longer call the unkeyed function. It is kept,
--    not dropped, while other open work still tests it directly.
-- 2. Every stored record is deleted, so no plain SHA-256 of an email or IP is
--    left. The new code's records are deleted too: every count starts again
--    once, at most 10 minutes of tries (a day for code checks), which the
--    limits are generous enough to absorb.

revoke execute on function public.claim_auth_attempt(text, text, text) from service_role;

delete from public.auth_throttle_events;
