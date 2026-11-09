import "server-only";

import type { ServiceClient } from "@/lib/supabase/service";

import { itemAlreadyGone, removeItem } from "./client";
import { plaidConfig, type PlaidConfig } from "./config";
import { openToken } from "./token-box";

type Claim = { id: string; student_id: string; item_id: string; token_ciphertext: string; claim_id: string };
export type CleanupResult = { claimed: number; removed: number; failed: number; unavailable: boolean };

// Counts only: neither tokens nor their student/item bindings reach logs or
// cron responses. A failed acknowledgement leaves the leased row for retry.
export async function runAccountCleanup(service: ServiceClient, config: PlaidConfig | null = plaidConfig()): Promise<CleanupResult> {
  const result: CleanupResult = { claimed: 0, removed: 0, failed: 0, unavailable: false };
  try {
    const { data, error } = await service.rpc("claim_plaid_account_cleanup");
    if (error) return { ...result, unavailable: true };
    const claims = (data ?? []) as Claim[];
    result.claimed = claims.length;
    result.unavailable = !config && claims.length > 0;
    await Promise.all(claims.map(async (claim) => {
      try {
        const token = config ? openToken(claim.token_ciphertext, config.tokenKey, { studentId: claim.student_id, itemId: claim.item_id }) : null;
        const answer = token === null || !config ? null : await removeItem(config, token);
        const removed = answer !== null && (answer.ok || itemAlreadyGone(answer));
        const finished = await service.rpc("finish_plaid_account_cleanup", {
          p_id: claim.id, p_claim_id: claim.claim_id, p_removed: removed,
        });
        if (removed && !finished.error && finished.data === true) result.removed++;
        else result.failed++;
      } catch {
        result.failed++;
      }
    }));
    return result;
  } catch {
    return { ...result, unavailable: true };
  }
}
