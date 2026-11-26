-- Created with Claude Code (2026-11-21). Retires the unkeyed sign-in limit
-- records once the app counts tries with claim_auth_attempt_hashed()
-- (20261121210000_keyed_auth_throttle.sql).
--
-- Applied by hand AFTER the app code that calls claim_auth_attempt_hashed()
-- is deployed: cense-preview first, then production. Run earlier, the
-- deployed app would lose its sign-in limits and refuse code and password
-- sign-ins (503) until the new code is live. On cense-preview, rebase every
-- open branch first: a preview on the old code refuses them too. Running it
-- again is harmless but resets every live limit again (part 2).
--
-- 1. The app's server may no longer call the unkeyed function. It is kept,
--    not dropped, while other open work still tests it directly.
-- 2. Every stored record is deleted, so no plain SHA-256 of an email or IP is
--    left. The two kinds look alike (64 hex characters), so the new code's
--    records go too. Counts therefore restart twice: at the deploy (the new
--    keys match no old row) and here. Each restart forgives at most 10
--    minutes of tries, or a day of code checks: on deploy day up to about
--    three times the daily code-check cap on one email, still about 3 in
--    20,000 against a 6-digit code.

revoke execute on function public.claim_auth_attempt(text, text, text) from service_role;

delete from public.auth_throttle_events;
