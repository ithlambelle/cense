-- Run on a disposable local DB after migrations; all fixture changes roll back.
-- psql -v ON_ERROR_STOP=1 -f supabase/checks/plaid_account_cleanup.sql
begin;
do $$
declare
  student uuid := 'd0000000-0000-4000-8000-000000000001';
  job record;
  job2 record;
begin
  if not public.plaid_account_cleanup_ready() then raise exception 'cleanup trigger missing'; end if;
  if has_table_privilege('authenticated', 'plaid.account_cleanup', 'SELECT')
    or has_table_privilege('anon', 'plaid.account_cleanup', 'SELECT')
    or has_table_privilege('service_role', 'plaid.account_cleanup', 'SELECT') then
    raise exception 'queue table exposed';
  end if;
  if has_function_privilege('authenticated', 'public.claim_plaid_account_cleanup()', 'EXECUTE')
    or has_function_privilege('anon', 'public.claim_plaid_account_cleanup()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.finish_plaid_account_cleanup(uuid,uuid,boolean)', 'EXECUTE')
    or has_function_privilege('anon', 'public.plaid_account_cleanup_ready()', 'EXECUTE') then
    raise exception 'cleanup functions exposed';
  end if;
  if not has_function_privilege('service_role', 'public.claim_plaid_account_cleanup()', 'EXECUTE') then
    raise exception 'worker cannot claim';
  end if;
  insert into auth.users(id, email) values (student, 'cleanup-test@example.test');
  insert into plaid.items(student_id, item_id, token_ciphertext) values (student, 'cleanup-item-test', 'v1.test-ciphertext');
  if exists (select 1 from plaid.account_cleanup where student_id = student) then raise exception 'live account queued'; end if;

  -- An auth deletion that rolls back cannot leave cleanup for a live account.
  begin
    delete from auth.users where id = student;
    raise exception 'test rollback' using errcode = 'P0002';
  exception when no_data_found then null;
  end;
  if not exists (select 1 from plaid.items where student_id = student)
    or exists (select 1 from plaid.account_cleanup where student_id = student) then raise exception 'rollback was not atomic'; end if;

  delete from auth.users where id = student;
  if exists (select 1 from plaid.items where student_id = student) then raise exception 'token did not cascade'; end if;
  if not exists (select 1 from plaid.account_cleanup where student_id = student and token_ciphertext = 'v1.test-ciphertext') then
    raise exception 'ciphertext lost on account deletion';
  end if;

  select * into strict job from public.claim_plaid_account_cleanup() where student_id = student;
  if exists (select 1 from public.claim_plaid_account_cleanup() where student_id = student) then raise exception 'claim was duplicated'; end if;
  if public.finish_plaid_account_cleanup(job.id, gen_random_uuid(), true) then raise exception 'wrong lease acknowledged'; end if;
  if not public.finish_plaid_account_cleanup(job.id, job.claim_id, false) then raise exception 'failure not released'; end if;
  if exists (select 1 from public.claim_plaid_account_cleanup() where student_id = student) then raise exception 'failed job retried too soon'; end if;
  update plaid.account_cleanup set retry_at = now() - interval '1 second' where id = job.id;
  select * into strict job2 from public.claim_plaid_account_cleanup() where student_id = student;
  if job2.claim_id = job.claim_id then raise exception 'lease reused'; end if;
  if public.finish_plaid_account_cleanup(job.id, job.claim_id, true) then raise exception 'stale worker deleted newer claim'; end if;
  if not public.finish_plaid_account_cleanup(job2.id, job2.claim_id, true) then raise exception 'successful removal not acknowledged'; end if;
  if exists (select 1 from plaid.account_cleanup where student_id = student) then raise exception 'ciphertext kept after removal'; end if;
end;
$$;
set local role service_role;
select public.plaid_account_cleanup_ready();
select count(*) from public.claim_plaid_account_cleanup();
reset role;
rollback;
