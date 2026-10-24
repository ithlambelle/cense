import { describe, expect, it } from "vitest";

import { DENIAL_PLAN_STEPS, denialReasonLine, nextDenialStep } from "./denial";

describe("nextDenialStep", () => {
  it("is the first step not done, in the plan's order", () => {
    expect(nextDenialStep(new Set())?.title).toBe("Read the issuer’s letter");
    expect(nextDenialStep(new Set(["read_letter", "check_reports"]))?.title).toBe("Pause new applications");
    // A step done out of order does not skip an earlier one.
    expect(nextDenialStep(new Set(["check_reports"]))?.step).toBe("read_letter");
  });

  it("is null once all five are done", () => {
    expect(nextDenialStep(new Set(DENIAL_PLAN_STEPS.map(({ step }) => step)))).toBeNull();
  });
});

describe("denialReasonLine", () => {
  it("says each picked reason in plain words", () => {
    expect(denialReasonLine("no_credit_history")).toBe("not enough credit history");
    expect(denialReasonLine("report_frozen")).toBe("credit report frozen");
  });

  it("says other for something else, never the student's own note", () => {
    expect(denialReasonLine("something_else")).toBe("other");
  });

  it("has no line while the letter has not come", () => {
    expect(denialReasonLine("no_letter_yet")).toBeNull();
  });
});
