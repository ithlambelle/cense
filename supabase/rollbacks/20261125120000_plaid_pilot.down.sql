-- Created with Claude Code (2026-11-25). Backs out
-- supabase/migrations/20261125120000_plaid_pilot.sql. Not a migration: it
-- lives outside supabase/migrations so nothing runs it on its own. Run it by
-- hand in the Supabase SQL editor only to undo the production pilot.
--
-- Set PLAID_ENV back to sandbox (or unset it) and redeploy first: in
-- production the bank-link routes call these functions, and without them no
-- one can link. Dropping the counter loses how many production Items were
-- made, and Plaid still counts them, so write `used` down before running this
-- (select budget, used from pilot.plaid_item_budget). One transaction: it
-- applies whole or not at all.

begin;

drop function if exists public.claim_plaid_item_slot();
drop function if exists public.plaid_pilot_access();
drop table if exists pilot.plaid_item_budget;
drop table if exists pilot.plaid_students;
drop schema if exists pilot;

commit;
