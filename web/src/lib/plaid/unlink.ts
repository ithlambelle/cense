import "server-only";

import type { Student } from "@/lib/api/auth";

import { itemAlreadyGone, removeItem } from "./client";
import { plaidConfig, type PlaidConfig } from "./config";
import { deleteBankLink, readAccessTokens } from "./store";

export type UnlinkResult =
  // Every Item is removed at Plaid (or was already gone there), and the
  // token, balances and answers are deleted.
  | { kind: "removed" }
  // No bank was linked: nothing to do.
  | { kind: "none" }
  // Plaid could not remove an Item. Nothing was deleted, so the token is
  // still there to try again with.
  | { kind: "plaid_unreachable" }
  // A bank is linked but the Plaid settings are missing. Nothing changed.
  | { kind: "not_configured" }
  | { kind: "database_error"; error: { code?: string; message: string } };

// Unlinks every bank a student has linked: each Item is removed at Plaid
// first (which ends it there and, outside the sandbox, stops billing), then
// the token, balances and answers are deleted. Disconnect (DELETE
// /bank-link) uses it, and account deletion (S28, #76) must call it before it
// deletes the sign-in record: the database cascade alone would delete
// Cense's copy and leave the Item alive at Plaid. Uses the student's own
// session, like every student route.
//
// An Item whose token cannot be opened (the key changed) can never be removed
// at Plaid; its local copy is still deleted, and the orphan is logged.
export async function removeBankLinksForStudent(student: Student, config: PlaidConfig | null = plaidConfig()): Promise<UnlinkResult> {
  const items = await readAccessTokens(student, config);
  if (!items.ok) return { kind: "database_error", error: items.error };
  if (items.value.length === 0) return { kind: "none" };
  if (!config) return { kind: "not_configured" };

  for (const item of items.value) {
    if (item.kind === "unreadable") {
      console.error(JSON.stringify({ event: "plaid_item_orphaned", reason: "token_unreadable" }));
      continue;
    }
    const removed = await removeItem(config, item.accessToken);
    if (!removed.ok && !itemAlreadyGone(removed)) return { kind: "plaid_unreachable" };
  }

  const deleted = await deleteBankLink(student);
  if (!deleted.ok) return { kind: "database_error", error: deleted.error };
  return deleted.value ? { kind: "removed" } : { kind: "none" };
}
