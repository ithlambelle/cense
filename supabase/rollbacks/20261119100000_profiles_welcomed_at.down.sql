-- Created with Claude Code (2026-11-19). Undoes
-- 20261119100000_profiles_welcomed_at.sql: drops profiles.welcomed_at, which
-- also removes its update grant, so students change only the columns
-- 20261117100000_security_db_limits.sql granted.
--
-- Roll back the app change first, or with this: /start reads the column and
-- "Let's go" writes it. With the app still deployed, /start cannot read it and
-- sends everyone to their usual screen, so no one is stuck, but a new student
-- already on the welcome cannot finish it. Running the migration again later
-- marks every student who exists then as welcomed. Safe to run again.

alter table public.profiles drop column if exists welcomed_at;
