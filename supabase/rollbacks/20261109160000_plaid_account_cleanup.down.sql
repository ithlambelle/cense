-- Revert the app to synchronous Plaid unlink before running this manually.
-- Never discard tokens for deleted accounts. Drain the queue first; a
-- nonempty queue aborts the entire rollback with every function/trigger intact.
begin;

-- Block new account deletions before checking the queue, so an auth cascade
-- cannot add a token between the guard and dropping its trigger/table.
lock table auth.users in share row exclusive mode;
do $$
begin
  if to_regclass('plaid.account_cleanup') is not null then
    lock table plaid.account_cleanup in access exclusive mode;
    if exists (select 1 from plaid.account_cleanup) then
      raise exception 'Plaid cleanup queue is not empty; drain it before rollback'
        using errcode = '55000';
    end if;
  end if;
end;
$$;

drop trigger if exists queue_plaid_account_cleanup on auth.users;
drop function if exists plaid.queue_account_cleanup();
drop function if exists public.plaid_account_cleanup_ready();
drop function if exists public.claim_plaid_account_cleanup();
drop function if exists public.finish_plaid_account_cleanup(uuid, uuid, boolean);
drop table if exists plaid.account_cleanup;

commit;
