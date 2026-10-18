-- profiles.display_name: what the student wants to be called on Home and in
-- their account. Optional; null until they add one. The API trims it and
-- stores null rather than an empty name.
alter table public.profiles
  add column display_name text
    check (display_name is null or char_length(display_name) between 1 and 60);
