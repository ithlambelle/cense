-- The Analytics switch on Security and privacy (privacy policy, "Your choices
-- and rights"): when set, the student turned analytics and session recordings
-- off, and it follows them to every device. Null means analytics is on.
--
-- Yunho applies this by hand in the Supabase SQL editor, before the app that
-- reads it is deployed: every signed-in page reads this column. Safe to run
-- again.
--
-- No new grant or policy: students already read and update their own profile
-- row ("Students can read their own profile" and "... update their own
-- profile", 20261009180000_mvp1_schema.sql), and the account deletion that
-- removes the row is the cascade from auth.users.
alter table public.profiles
  add column if not exists analytics_opted_out_at timestamptz;
