import { apiRequest, failureMessage, isUnauthorized } from "./client";
import { savePlanStep } from "./plans";

// One tracked card's own fields, saved through PATCH /applications/{id}.

export type ApplicationSave = { kind: "ok" } | { kind: "signed-out" } | { kind: "failed"; message: string };

// The card's credit limit alone, in cents (null clears it). The status is left
// as it is, so editing the limit never touches the approval.
export async function saveCreditLimit(applicationId: string, cents: number | null): Promise<ApplicationSave> {
  const result = await apiRequest("patch", "/applications/{id}", {
    pathParams: { id: applicationId },
    body: { creditLimitCents: cents },
  });
  if (result.ok) return { kind: "ok" };
  if (isUnauthorized(result)) return { kind: "signed-out" };
  return { kind: "failed", message: failureMessage(result) };
}

// Autopay is the card's own status, not a plan step: on lights Home's autopay
// star, off puts it out. Safe to repeat.
export async function saveAutopay(applicationId: string, on: boolean): Promise<ApplicationSave> {
  const result = await apiRequest("patch", "/applications/{id}", {
    pathParams: { id: applicationId },
    body: { autopayStatus: on ? "on" : "off" },
  });
  if (result.ok) return { kind: "ok" };
  if (isUnauthorized(result)) return { kind: "signed-out" };
  return { kind: "failed", message: failureMessage(result) };
}

// What the student said on "Did you turn on autopay?" (US-10, I3): autopay on
// with the payment type, or "Not yet", which saves autopay off and clears it.
export async function saveAutopayAnswer(
  applicationId: string,
  answer: "statement_balance" | "minimum" | "fixed_amount" | "not_yet",
): Promise<ApplicationSave> {
  const result = await apiRequest("patch", "/applications/{id}", {
    pathParams: { id: applicationId },
    body: answer === "not_yet" ? { autopayStatus: "off" } : { autopayStatus: "on", autopayPaymentType: answer },
  });
  if (result.ok) return { kind: "ok" };
  if (isUnauthorized(result)) return { kind: "signed-out" };
  return { kind: "failed", message: failureMessage(result) };
}

// The monthly spend limit the student chose (US-04, Flow A), in cents, then
// the first-month "Set a spend limit" star, so Home and the setup list show it
// lit. Both are safe to repeat, so a failed second step is fixed by saving again.
export async function saveSpendLimit(applicationId: string, cents: number): Promise<ApplicationSave> {
  const result = await apiRequest("patch", "/applications/{id}", {
    pathParams: { id: applicationId },
    body: { spendLimitCents: cents },
  });
  if (!result.ok) {
    if (isUnauthorized(result)) return { kind: "signed-out" };
    return { kind: "failed", message: failureMessage(result) };
  }
  return savePlanStep(applicationId, "first_month", "spend_limit", true);
}
