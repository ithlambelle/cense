import type { components } from "../../../../api/openapi";
import { apiRequest, failureMessage, isUnauthorized, type ApiFailure } from "./client";

// Saved progress on the first-month and denial plans: one lit star per
// finished step (GET, PUT and DELETE /applications/{id}/plans/...).

export type PlanName = components["schemas"]["PlanProgress"]["plan"];
export type PlanStepName = components["schemas"]["PlanStep"]["step"];

export type PlanStepsResult =
  | { kind: "ok"; done: ReadonlySet<PlanStepName> }
  | { kind: "signed-out" }
  | { kind: "failed"; message: string };

export type PlanStepSave = { kind: "ok" } | Exclude<PlanStepsResult, { kind: "ok" }>;

function failure(result: ApiFailure): Exclude<PlanStepsResult, { kind: "ok" }> {
  // A 503 is a passing outage (the table is live), so it fails with the API's
  // "try again" message like any other error.
  if (isUnauthorized(result)) return { kind: "signed-out" };
  return { kind: "failed", message: failureMessage(result) };
}

export async function loadPlanSteps(applicationId: string, plan: PlanName): Promise<PlanStepsResult> {
  const result = await apiRequest("get", "/applications/{id}/plans/{plan}", {
    pathParams: { id: applicationId, plan },
  });
  if (!result.ok) return failure(result);
  return { kind: "ok", done: new Set(result.data.completedSteps.map((saved) => saved.step)) };
}

// Lights a star (PUT) or puts it out (DELETE). Both are safe to repeat.
export async function savePlanStep(
  applicationId: string,
  plan: PlanName,
  step: PlanStepName,
  done: boolean,
): Promise<PlanStepSave> {
  const pathParams = { id: applicationId, plan, step };
  const result = done
    ? await apiRequest("put", "/applications/{id}/plans/{plan}/steps/{step}", { pathParams })
    : await apiRequest("delete", "/applications/{id}/plans/{plan}/steps/{step}", { pathParams });
  return result.ok ? { kind: "ok" } : failure(result);
}
