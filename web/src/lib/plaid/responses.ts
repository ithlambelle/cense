import "server-only";

import { apiError } from "@/lib/api/errors";
import { SAFE_TO_SPEND_COPY } from "@/lib/safe-to-spend/copy";

// The answers the bank-link and safe-to-spend routes share. Plaid's own
// messages are never passed on: they can name internals and are not written
// for students.

export const NO_STORE = { "Cache-Control": "no-store" };

// The Plaid settings are missing or not usable (lib/plaid/config.ts).
export function safeToSpendOff(): Response {
  return apiError(503, "safe_to_spend_unavailable", "Safe to spend isn’t available right now.");
}

// Production only: the student is not on the pilot allowlist
// (lib/plaid/pilot.ts). No screen offers Link to them, so only a direct call
// sees this.
export function pilotOnly(): Response {
  return apiError(403, "pilot_only", "Connecting a bank isn’t open to everyone yet.");
}

// Production only: the student's allowance or the pilot's Item budget is used
// up. Nothing was sent to Plaid.
export function itemBudgetFull(): Response {
  return apiError(503, "bank_link_full", "We can’t connect new banks right now. Try again later.");
}

// Production pilot: the exchange failed after it took the student's slot, so
// trying again would only meet bank_link_full. The team sees
// plaid_pilot_slot_lost in the logs and raises the allowance.
export function pilotLinkFailed(): Response {
  console.error(JSON.stringify({ event: "plaid_pilot_slot_lost" }));
  return apiError(502, "pilot_link_failed", SAFE_TO_SPEND_COPY.pilotLinkFailed);
}

export function bankUnreachable(): Response {
  return apiError(502, "bank_unavailable", "We couldn’t reach your bank. Try again in a few minutes.");
}

export function notLinked(): Response {
  return apiError(404, "not_linked", "No bank is connected.");
}

export function alreadyLinked(): Response {
  return apiError(409, "already_linked", "Your bank is already connected.");
}

export function reconnectNeeded(): Response {
  return apiError(409, "reconnect_needed", "Your bank needs you to sign in again.");
}

// The Item is gone at Plaid (revoked at my.plaid.com, or the token cannot be
// opened): only disconnecting and linking again helps.
export function relinkNeeded(): Response {
  return apiError(409, "relink_needed", "Your bank connection ended. Connect it again to update.");
}
