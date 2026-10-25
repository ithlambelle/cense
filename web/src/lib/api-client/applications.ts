import { apiRequest, failureMessage, isUnauthorized } from "./client";

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
