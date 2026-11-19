import "server-only";

import type { Student } from "@/lib/api/auth";

import { itemAlreadyGone, removeItem } from "./client";
import { plaidConfig, type PlaidConfig } from "./config";
import { deleteBankLink, disconnectBankLink, readAccessTokens } from "./store";

export type UnlinkResult =
  // The token, balances, transactions and answers are deleted. Every Item
  // Plaid did not confirm removed is queued for the daily cleanup job.
  | { kind: "removed" }
  // No bank was linked: nothing to do.
  | { kind: "none" }
  // Only before 20261118200000_disconnect_never_blocked.sql is applied: Plaid
  // could not remove an Item, so nothing was deleted and the token is still
  // there to try again with.
  | { kind: "plaid_unreachable" }
  // A bank is linked but the Plaid settings are missing. Nothing changed.
  | { kind: "not_configured" }
  | { kind: "database_error"; error: { code?: string; message: string } };

// The database's answers when disconnect_bank_link does not exist yet:
// PostgREST's (no function by that name in its schema cache) and Postgres's
// own (undefined_function).
const NO_SUCH_FUNCTION = new Set(["PGRST202", "42883"]);

// Disconnect (DELETE /bank-link, Figma E3) never waits on Plaid (Ben, Nov 18).
// Each Item is removed at Plaid first, as before (which ends it there and,
// outside the sandbox, stops billing). Then our copy is always deleted: the
// token, balances, transactions and answers, in one step. Any Item Plaid did
// not confirm removed (down, or any other error) is queued in the same step,
// with its encrypted token, for the daily cleanup job, which retries
// /item/remove until Plaid confirms (the queue account deletion uses). Uses
// the student's own session, like every student route.
//
// An Item whose token cannot be opened (the key changed) can never be removed
// at Plaid, so it is not queued; its local copy is still deleted, and the
// orphan is logged.
//
// not_configured is unchanged: with no Plaid settings there is no key and no
// Plaid, so nothing is deleted. The route answers 503 before this runs, and
// production always has the settings.
export async function removeBankLinksForStudent(student: Student, config: PlaidConfig | null = plaidConfig()): Promise<UnlinkResult> {
  const items = await readAccessTokens(student, config);
  if (!items.ok) return { kind: "database_error", error: items.error };
  if (items.value.length === 0) return { kind: "none" };
  if (!config) return { kind: "not_configured" };

  const notRemoved: string[] = [];
  for (const item of items.value) {
    if (item.kind === "unreadable") {
      console.error(JSON.stringify({ event: "plaid_item_orphaned", reason: "token_unreadable" }));
      continue;
    }
    const removed = await removeItem(config, item.accessToken);
    if (!removed.ok && !itemAlreadyGone(removed)) notRemoved.push(item.itemId);
  }

  const disconnected = await disconnectBankLink(student, notRemoved);
  if (!disconnected.ok && disconnected.error.code && NO_SUCH_FUNCTION.has(disconnected.error.code)) {
    return disconnectBeforeMigration(student, notRemoved);
  }
  if (!disconnected.ok) return { kind: "database_error", error: disconnected.error };
  if (!disconnected.value) return { kind: "none" };
  // A count only, never an item id or a token.
  if (notRemoved.length > 0) console.error(JSON.stringify({ event: "plaid_item_queued", count: notRemoved.length }));
  return { kind: "removed" };
}

// TODO: remove after 20261118200000_disconnect_never_blocked.sql is applied
// to production. Until then this is the old disconnect, unchanged: when Plaid
// did not remove an Item nothing is deleted; otherwise delete_bank_link.
async function disconnectBeforeMigration(student: Student, notRemoved: string[]): Promise<UnlinkResult> {
  console.error(JSON.stringify({ event: "bank_disconnect_legacy" }));
  if (notRemoved.length > 0) return { kind: "plaid_unreachable" };
  const deleted = await deleteBankLink(student);
  if (!deleted.ok) return { kind: "database_error", error: deleted.error };
  return deleted.value ? { kind: "removed" } : { kind: "none" };
}
