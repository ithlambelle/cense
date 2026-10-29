import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { getAccounts, itemAlreadyGone, needsReconnect } from "@/lib/plaid/client";
import { plaidConfig } from "@/lib/plaid/config";
import { bankUnreachable, NO_STORE, notLinked, reconnectNeeded, relinkNeeded, safeToSpendOff } from "@/lib/plaid/responses";
import { loadSafeToSpend, markLinkStatus, readAccessToken, saveBalances } from "@/lib/plaid/store";
import { balanceRows } from "@/lib/safe-to-spend/compute";

// Reads the balances from Plaid again and answers safe to spend (US-12).
// Home calls it when the numbers are over an hour old, How we got this when
// the student taps Refresh, and both after the student signs in to their
// bank again.
export async function POST(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  const config = plaidConfig();
  if (!config) return safeToSpendOff();

  const stored = await readAccessToken(student, config);
  if (!stored.ok) return databaseError("bank_link_secret_read", stored.error);
  if (stored.value.kind === "none") return notLinked();
  // Saved on the link, so Home shows the notice instead of the last number.
  const relink = async () => {
    const marked = await markLinkStatus(student, "relink_needed");
    return marked.ok ? relinkNeeded() : databaseError("bank_link_mark_status", marked.error);
  };
  if (stored.value.kind === "unreadable") return relink();

  const accounts = await getAccounts(config, stored.value.accessToken);
  if (!accounts.ok) {
    if (needsReconnect(accounts)) {
      const marked = await markLinkStatus(student, "reconnect_needed");
      if (!marked.ok) return databaseError("bank_link_mark_status", marked.error);
      return reconnectNeeded();
    }
    if (itemAlreadyGone(accounts)) return relink();
    return bankUnreachable();
  }

  const saved = await saveBalances(student, balanceRows(accounts.data.accounts));
  if (!saved.ok) return databaseError("bank_balances_save", saved.error);
  // Disconnected while Plaid answered.
  if (!saved.value) return notLinked();

  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) return databaseError("safe_to_spend_read", loaded.error);
  if (!loaded.value) return notLinked();
  return Response.json(loaded.value, { headers: NO_STORE });
}
