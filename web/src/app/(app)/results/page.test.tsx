import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResultView } from "@/lib/results/compute";

import ResultsPage from "./page";

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };

let storedAnswers: unknown = null;
vi.mock("@/lib/api/auth", () => ({
  authenticatedStudent: async () => ({
    studentId: "00000000-0000-4000-8000-0000000000ff",
    email: null,
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { answers: storedAnswers }, error: null }) }) }),
      }),
    },
  }),
}));

// Saving is tested in save.test.ts; here it only has to be called with the kept answers.
const saveRecommendation = vi.fn(async () => "saved");
vi.mock("@/lib/results/save", () => ({ saveRecommendation: (...args: unknown[]) => saveRecommendation(...(args as [])) }));

async function viewFor(answers: unknown): Promise<ResultView> {
  storedAnswers = answers;
  const element = await ResultsPage();
  if (!isValidElement<{ view: ResultView }>(element)) throw new Error("expected the result view");
  return element.props.view;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ResultsPage", () => {
  it("works the result out from the valid answers of a draft the schema now rejects", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await viewFor({ ...ALL_SIX, retiredField: "x" })).kind).toBe("match");
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("asks to finish the quiz when a dropped answer leaves it incomplete", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await viewFor({ ...ALL_SIX, incomeBand: "lots" })).kind).toBe("quiz_unfinished");
  });

  it("shows the same result as before for a draft that is already valid", async () => {
    const warn = vi.spyOn(console, "warn");
    expect((await viewFor(ALL_SIX)).kind).toBe("match");
    expect(warn).not.toHaveBeenCalled();
  });

  it("saves the result from the kept answers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    saveRecommendation.mockClear();
    await viewFor({ ...ALL_SIX, retiredField: "x" });
    expect(saveRecommendation).toHaveBeenCalledOnce();
    expect((saveRecommendation.mock.calls[0] as unknown[])[1]).toEqual(ALL_SIX);
  });
});
