import "server-only";

import type { ServiceClient } from "@/lib/supabase/service";
import { pingHeartbeat } from "@/lib/reminders/heartbeat";

import { itemAlreadyGone, removeItem } from "./client";
import { plaidConfig, type PlaidConfig } from "./config";
import { openToken } from "./token-box";

// gives_up_if_unreadable (20261117110000_security_quotas.sql): one more
// unreadable failure gives the row up. Missing before that migration, and
// then read as false.
type Claim = { id: string; student_id: string; item_id: string; token_ciphertext: string; claim_id: string; gives_up_if_unreadable?: boolean };
// Why a removal failed, for finish_plaid_account_cleanup. Only
// "undecryptable" (the token does not open with the configured key; a forged
// token saved before the account was deleted never will) counts toward
// giving up. Plaid errors and missing settings are retried every day for
// ever, and keep failing the cleanup check.
type FailureReason = "undecryptable" | "plaid_error" | "not_configured";
// gaveUp: rows given up in this run, after their 5th unreadable failure in a
// row. The database keeps them encrypted and stops claiming them. The run
// that gives one up fails the cleanup check once, so a person sees it; later
// runs no longer claim it and stay green.
export type CleanupResult = { claimed: number; removed: number; failed: number; gaveUp: number; unavailable: boolean; deferred: boolean };

// Stop starting batches after 30s from request start. Each batch has at most
// five parallel 10s Plaid calls, leaving room under the cron's 60s limit for
// acknowledgement and both alerts. Emails retain their own 45s budget.
const CLAIM_BUDGET_MS = 30_000;

function log(event: string, fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...fields }));
}

// Counts only: neither tokens nor their student/item bindings reach logs or
// cron responses. A failed acknowledgement leaves the leased row for retry.
export async function runAccountCleanup(service: ServiceClient, config: PlaidConfig | null = plaidConfig(), { startedAt = Date.now() }: { startedAt?: number } = {}): Promise<CleanupResult> {
  const result: CleanupResult = { claimed: 0, removed: 0, failed: 0, gaveUp: 0, unavailable: false, deferred: false };
  try {
    while (Date.now() - startedAt < CLAIM_BUDGET_MS) {
      const { data, error } = await service.rpc("claim_plaid_account_cleanup");
      if (error) return { ...result, unavailable: true };
      const claims = (data ?? []) as Claim[];
      if (claims.length === 0) return result;
      result.claimed += claims.length;
      result.unavailable ||= !config;
      await Promise.all(claims.map(async (claim) => {
        try {
          const token = config ? openToken(claim.token_ciphertext, config.tokenKey, { studentId: claim.student_id, itemId: claim.item_id }) : null;
          const answer = token === null || !config ? null : await removeItem(config, token);
          const removed = answer !== null && (answer.ok || itemAlreadyGone(answer));
          const reason: FailureReason | null = removed ? null : !config ? "not_configured" : token === null ? "undecryptable" : "plaid_error";
          // A removal is acknowledged with three arguments, which both the
          // old and the new function take, so the code can deploy first.
          const finished = await service.rpc("finish_plaid_account_cleanup", {
            p_id: claim.id, p_claim_id: claim.claim_id, p_removed: removed, ...(reason ? { p_reason: reason } : {}),
          });
          if (removed && !finished.error && finished.data === true) result.removed++;
          else if (reason === "undecryptable" && claim.gives_up_if_unreadable === true && !finished.error && finished.data === true) {
            // Logged once: a given-up row is never claimed again. Counts
            // only, never the row's student, item or token.
            log("plaid_cleanup_gave_up", {});
            result.gaveUp++;
          } else result.failed++;
        } catch {
          result.failed++;
        }
      }));
    }
    return { ...result, deferred: true };
  } catch {
    return { ...result, unavailable: true };
  }
}

// A stuck cleanup row must not make healthy reminder delivery look broken.
// This optional check monitors cleanup failures and an undrained backlog.
export async function runAccountCleanupWithHeartbeat(service: ServiceClient, options: { startedAt?: number } = {}): Promise<CleanupResult> {
  const heartbeat = { url: process.env.PLAID_CLEANUP_HEARTBEAT_URL ?? "" };
  const started = pingHeartbeat("start", undefined, heartbeat);
  const result = await runAccountCleanup(service, plaidConfig(), options);
  await started;
  await pingHeartbeat(result.failed || result.gaveUp || result.unavailable || result.deferred ? "fail" : "success", result, heartbeat);
  return result;
}
