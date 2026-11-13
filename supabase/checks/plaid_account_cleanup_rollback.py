"""Exercise the real rollback file on a disposable local DB, then reapply it."""
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

url = sys.argv[1]
if urlsplit(url).hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("Refusing a non-local database")
root = Path(__file__).resolve().parents[2]
down = root / "supabase/rollbacks/20261109160000_plaid_account_cleanup.down.sql"
up = root / "supabase/migrations/20261109160000_plaid_account_cleanup.sql"


def sql(*args, text=None, check=True):
    return subprocess.run(
        ["psql", url, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", *args],
        input=text, text=True, capture_output=True, check=check,
    )


# This test resets the queue schema. Refuse any existing cleanup work, even
# on localhost, so running it against a development stack cannot lose tokens.
if sql(text="select count(*) from plaid.account_cleanup;").stdout.strip() != "0":
    raise SystemExit("Rollback test requires an empty local cleanup queue")
fixture = "rollback-guard-test"
sql(text=f"""
insert into plaid.account_cleanup(student_id, item_id, token_ciphertext)
values ('d0000000-0000-4000-8000-000000000009', '{fixture}', 'v1.fake-test-ciphertext');
""")
refused = sql("-f", str(down), check=False)
if refused.returncode == 0 or "queue is not empty" not in refused.stderr:
    raise AssertionError("Nonempty queue did not refuse rollback")
if sql(text=f"select count(*) from plaid.account_cleanup where item_id = '{fixture}';").stdout.strip() != "1":
    raise AssertionError("Rollback lost the queued token")
if sql(text="select public.plaid_account_cleanup_ready();").stdout.strip() != "t":
    raise AssertionError("Refused rollback disabled account deletion protection")
sql(text=f"delete from plaid.account_cleanup where item_id = '{fixture}';")
sql("-f", str(down))
if sql(text="select to_regclass('plaid.account_cleanup') is null and to_regprocedure('public.claim_plaid_account_cleanup()') is null;").stdout.strip() != "t":
    raise AssertionError("Empty rollback left the cleanup schema behind")
sql("-f", str(down))  # idempotent when already rolled back
sql("-f", str(up))
sql("-f", str(root / "supabase/checks/plaid_account_cleanup.sql"))
print("Rollback refusal, token preservation, empty rollback, and reapply passed")
