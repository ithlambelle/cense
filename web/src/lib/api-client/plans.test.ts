import { afterEach, describe, expect, it, vi } from "vitest";

import { loadPlanSteps, savePlanStep } from "./plans";

const ID = "00000000-0000-4000-8000-000000000001";

function answer(status: number, body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () =>
    status === 204 ? new Response(null, { status }) : Response.json(body, { status }),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadPlanSteps", () => {
  it("returns the finished steps of one plan", async () => {
    const fetchFn = answer(200, {
      applicationId: ID,
      plan: "denial",
      completedSteps: [{ step: "read_letter", completedAt: "2026-10-24T12:00:00Z" }],
    });
    const result = await loadPlanSteps(ID, "denial");
    expect(result.kind === "ok" && [...result.done]).toEqual(["read_letter"]);
    expect(fetchFn.mock.calls[0][0]).toBe(`/api/v1/applications/${ID}/plans/denial`);
  });

  it("treats a 503 as a passing outage with the API's try-again message", async () => {
    answer(503, { error: { code: "data_unavailable", message: "Your data is temporarily unavailable. Please try again." } });
    expect(await loadPlanSteps(ID, "first_month")).toEqual({
      kind: "failed",
      message: "Your data is temporarily unavailable. Please try again.",
    });
  });

  it("says signed-out on 401 and passes other messages through", async () => {
    answer(401, { error: { code: "unauthorized", message: "Sign in to continue." } });
    expect(await loadPlanSteps(ID, "first_month")).toEqual({ kind: "signed-out" });
    answer(404, { error: { code: "not_found", message: "Application not found." } });
    expect(await loadPlanSteps(ID, "first_month")).toEqual({ kind: "failed", message: "Application not found." });
  });
});

describe("savePlanStep", () => {
  it("lights a star with PUT and puts it out with DELETE", async () => {
    let fetchFn = answer(201, { step: "reapply", completedAt: "2026-10-24T12:00:00Z" });
    expect(await savePlanStep(ID, "denial", "reapply", true)).toEqual({ kind: "ok" });
    expect(fetchFn.mock.calls[0][1]?.method).toBe("PUT");
    fetchFn = answer(204, null);
    expect(await savePlanStep(ID, "denial", "reapply", false)).toEqual({ kind: "ok" });
    expect(fetchFn.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("explains a plan that does not fit the card", async () => {
    answer(409, { error: { code: "plan_not_available", message: "The denial plan is for a denied application." } });
    expect(await savePlanStep(ID, "denial", "reapply", true)).toEqual({
      kind: "failed",
      message: "The denial plan is for a denied application.",
    });
  });
});
