import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { createBankLinkSchema } from "@/lib/api/safe-to-spend";
import { exchangePublicToken, getAccounts, removeItem } from "@/lib/plaid/client";
import { plaidConfig, type PlaidConfig } from "@/lib/plaid/config";
import { alreadyLinked, bankUnreachable, NO_STORE, notLinked, safeToSpendOff } from "@/lib/plaid/responses";
import { linkStatus, loadSafeToSpend, saveBalances, saveBankLink } from "@/lib/plaid/store";
import { removeBankLinksForStudent } from "@/lib/plaid/unlink";
import { balanceRows } from "@/lib/safe-to-spend/compute";

// Removes an Item this request made but could not keep, so it is not left
// at Plaid (outside the sandbox, an Item bills until removed).
async function discard(config: PlaidConfig, accessToken: string) {
  const removed = await removeItem(config, accessToken);
  if (!removed.ok) console.error(JSON.stringify({ event: "plaid_item_orphaned" }));
}

// Link a bank (US-12): exchanges the public token Plaid Link handed the
// browser for an access token, seals it, and reads the balances once. The
// access token never leaves the server.
export async function POST(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  const config = plaidConfig();
  if (!config) return safeToSpendOff();

  const parsed = createBankLinkSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  // One bank per student: refused before Plaid makes a second Item.
  const status = await linkStatus(student);
  if (!status.ok) return databaseError("bank_link_read", status.error);
  if (status.value !== null) return alreadyLinked();

  const exchanged = await exchangePublicToken(config, parsed.data.publicToken);
  if (!exchanged.ok) {
    if (exchanged.kind === "plaid" && exchanged.code === "INVALID_PUBLIC_TOKEN") {
      return apiError(400, "link_expired", "That connection expired. Please connect again.");
    }
    return bankUnreachable();
  }
  const { access_token: accessToken, item_id: itemId } = exchanged.data;

  // Read once now, so the bank's name and the first numbers are there. A
  // failed read still keeps the link; Home reads again later.
  const accounts = await getAccounts(config, accessToken);
  const institutionName = (accounts.ok ? accounts.data.item.institution_name?.trim().slice(0, 100) : null) || "Your bank";

  const saved = await saveBankLink(student, config, { itemId, accessToken, institutionName });
  if (!saved.ok) {
    await discard(config, accessToken);
    return databaseError("bank_link_save", saved.error);
  }
  if (saved.value === "conflict") {
    // A second Link finished at the same time as the first.
    await discard(config, accessToken);
    return alreadyLinked();
  }
  if (accounts.ok) {
    const balances = await saveBalances(student, balanceRows(accounts.data.accounts));
    if (!balances.ok) return databaseError("bank_balances_save", balances.error);
  }

  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) return databaseError("safe_to_spend_read", loaded.error);
  if (!loaded.value) return notLinked();
  return Response.json(loaded.value, { status: 201, headers: NO_STORE });
}

// Disconnect (US-12): every Item is removed at Plaid first, then the token,
// balances and answers are deleted (removeBankLinksForStudent, the same step
// account deletion takes). If Plaid cannot be reached nothing changes, so the
// token is never lost while the Item still exists there.
export async function DELETE(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  const config = plaidConfig();
  if (!config) return safeToSpendOff();

  const result = await removeBankLinksForStudent(student, config);
  switch (result.kind) {
    case "removed":
      return new Response(null, { status: 204, headers: NO_STORE });
    case "none":
      return notLinked();
    case "database_error":
      return databaseError("bank_link_delete", result.error);
    default:
      return apiError(502, "bank_unavailable", "We couldn’t disconnect your bank. Nothing changed. Try again in a few minutes.");
  }
}
