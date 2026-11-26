-- Created with Claude Code (2026-11-26). Undoes
-- 20261126150000_card_applications_remove.sql: students can no longer remove
-- any card, and a $0 credit limit is allowed in the database again. Roll back
-- the app change with it, or "Remove card" answers with a server error
-- (nothing is removed). Safe to run again.

drop policy if exists "Students can remove a card they added" on public.card_applications;
revoke delete on public.card_applications from authenticated;
alter table public.card_applications drop constraint if exists card_applications_credit_limit_positive;
