-- Save a recommendation with the student's own session.
--
-- Students cannot insert into recommendations directly. The server runs the
-- fit tier rules, then calls save_recommendation with the student's session,
-- so the row always belongs to auth.uid(). Known limit: a student could call
-- this function directly and save a made-up result, but only for themselves.
-- "No suitable card" saves card_id null with fit_tier not_yet (see #29).

-- The versions that produced each result, so it can be explained later:
-- the rules (e.g. "fit-rules v1.2") and the card data it ran on.
alter table public.recommendations add column rules_version text;
alter table public.recommendations add column card_data_version text;

create or replace function public.save_recommendation(
  p_card_id text,
  p_fit_tier text,
  p_reason text,
  p_rules_version text,
  p_card_data_version text,
  p_answer_snapshot jsonb,
  p_result_snapshot jsonb
)
returns public.recommendations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_row public.recommendations;
begin
  if v_student_id is null then
    raise exception 'save_recommendation needs a signed-in student'
      using errcode = '42501';
  end if;
  if p_rules_version is null or btrim(p_rules_version) = '' then
    raise exception 'save_recommendation needs a rules version'
      using errcode = '22023';
  end if;
  if p_card_data_version is null or btrim(p_card_data_version) = '' then
    raise exception 'save_recommendation needs a card data version'
      using errcode = '22023';
  end if;

  insert into public.recommendations
    (student_id, card_id, fit_tier, reason, rules_version, card_data_version, answer_snapshot, result_snapshot)
  values
    (v_student_id, p_card_id, p_fit_tier, p_reason, p_rules_version, p_card_data_version, p_answer_snapshot, p_result_snapshot)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.save_recommendation(text, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_recommendation(text, text, text, text, text, jsonb, jsonb) to authenticated;
