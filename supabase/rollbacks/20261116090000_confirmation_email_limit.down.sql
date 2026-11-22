-- Created with Claude Code (2026-11-16). Undoes
-- 20261116090000_confirmation_email_limit.sql: no daily limit on reminder
-- confirmation emails.
drop function if exists public.claim_confirmation_email();
drop table if exists public.confirmation_email_sends;
