import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { createBankLinkSchema } from "@/lib/api/safe-to-spend";
import { exchangePublicToken, getAccounts, removeItem } from "@/lib/plaid/client";
import { plaidConfig, type PlaidConfig } from "@/lib/plaid/config";
import { claimItemSlot, linkAccess } from "@/lib/plaid/pilot";
import { alreadyLinked, bankUnreachable, itemBudgetFull, NO_STORE, notLinked, pilotLinkFailed, pilotOnly, safeToSpendOff } from "@/lib/plaid/responses";
import { linkStatus, loadSafeToSpend, saveBalances, saveBankLink } from "@/lib/plaid/store";
import { syncStudentTransactions } from "@/lib/plaid/transactions";
import { removeBankLinksForStudent } from "@/lib/plaid/unlink";
import { balanceRows } from "@/lib/safe-to-spend/compute";

// Room for Plaid. Disconnect waits for /item/remove, up to 10 seconds an Item
// (TIMEOUT_MS in lib/plaid/client.ts), before it deletes anything, and Link
// makes three Plaid calls in a row. Without Fluid compute Vercel's default
// limit can be 10 seconds, which would end a Disconnect while Plaid hangs
// before the delete runs. 30 is within the 60 Vercel's Hobby plan allows
// without Fluid compute.
export const maxDuration = 30;

// Removes an Item this request made but could not keep, so it is not left
// at Plaid (outside the sandbox, an Item bills until removed).
async function discard(config: PlaidConfig, accessToken: string) {
  const removed = await removeItem(config, accessToken);
  if (!removed.ok) console.error(JSON.stringify({ event: "plaid_item_orphaned" }));
}

// Link a bank (US-12): exchanges the public token Plaid Link handed the
// browser for an access token, seals it, and reads the balances once. The
// access token never leaves the server. In production only pilot students
// may link, and each exchange first takes one slot of their allowance and of
// the pilot's Item budget (lib/plaid/pilot.ts).
export async function POST(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  const config = plaidConfig();
  if (!config) return safeToSpendOff();

  const parsed = createBankLinkSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const access = await linkAccess(student, config);
  if (!access.ok) return databaseError("plaid_pilot_read", access.error);
  if (access.value === "none") return pilotOnly();

  // One bank per student: refused before Plaid makes a second Item.
  const status = await linkStatus(student);
  if (!status.ok) return databaseError("bank_link_read", status.error);
  if (status.value !== null) return alreadyLinked();

  // Last step before Plaid makes an access token, which counts against the
  // budget. A failed exchange keeps the slot taken (the safe mistake).
  const slot = await claimItemSlot(student, config);
  if (!slot.ok) return databaseError("plaid_item_slot_claim", slot.error);
  if (!slot.value) return itemBudgetFull();

  const exchanged = await exchangePublicToken(config, parsed.data.publicToken);
  if (!exchanged.ok) {
    if (config.environment === "production") return pilotLinkFailed();
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
  // Transactions are pulled right after linking (Ben, Nov 11, with D34), so
  // Your money's This month has the month to show. Best effort, as on
  // refresh: a failed sync never stops the link, and the next refresh retries.
  const synced = await syncStudentTransactions(student, config, { itemId, accessToken });
  if (synced.kind !== "synced") console.error(JSON.stringify({ event: "plaid_transactions_sync_failed", kind: synced.kind }));

  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) return databaseError("safe_to_spend_read", loaded.error);
  if (!loaded.value) return notLinked();
  return Response.json(loaded.value, { status: 201, headers: NO_STORE });
}

// Disconnect (US-12, Figma E3): never blocked by Plaid (Ben, Nov 18). Each
// Item is removed at Plaid first, waiting up to the Plaid timeout (10
// seconds); then the token, balances, transactions and answers are deleted
// whatever Plaid answered, and any Item Plaid did not confirm removed is
// queued, with its encrypted token, for the daily cleanup job to remove at
// Plaid (removeBankLinksForStudent). So a Plaid outage, or a Plaid that never
// answers, still answers 204.
// 429 when an Item would be queued and the student already has 3 waiting
// (the cap in 20261118200000_disconnect_never_blocked.sql): nothing changed,
// and the copy says when to try again, since the daily job clears the queue.
// A 429 rather than the 503 data_unavailable: the data is fine and an
// immediate retry fails the same way, which is a limit, not an outage.
// The 502 is left only for the database before
// 20261118200000_disconnect_never_blocked.sql, where Plaid down still means
// nothing changes.
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
    case "queue_full":
      return apiError(429, "disconnect_limit", "We’re still removing your earlier bank links at Plaid. Nothing changed. Try again tomorrow.");
    default:
      return apiError(502, "bank_unavailable", "We couldn’t disconnect your bank. Nothing changed. Try again in a few minutes.");
  }
}
