import { describe, expect, it } from "vitest";

import { quizAnswersSchema } from "../api/schemas";
import { QUESTIONS } from "./questions";
import {
  MAX_CATEGORIES,
  QUIZ_STEP_COUNT,
  SPENDING_AMOUNTS,
  SPENDING_CATEGORIES,
  SPENDING_COPY,
  toggleAmount,
  toggleCategory,
} from "./spending";

describe("spending question", () => {
  it("comes after the six questions, as question 7 of 7", () => {
    expect(QUESTIONS).toHaveLength(6);
    expect(QUIZ_STEP_COUNT).toBe(7);
  });

  it("uses the frame's wording (144:2635)", () => {
    expect(SPENDING_CATEGORIES.map((option) => option.label)).toEqual([
      "Food and dining",
      "Groceries",
      "Gas and rides",
      "Travel home",
      "Shopping and subscriptions",
    ]);
    expect(SPENDING_AMOUNTS.map((option) => option.label)).toEqual(["Under $200", "$200 to $500", "Over $500"]);
    const text = JSON.stringify([SPENDING_COPY, SPENDING_CATEGORIES, SPENDING_AMOUNTS]);
    expect(text).not.toMatch(/[\u2014~]/);
  });

  it("is not an answer field yet, so the saved quiz and the API are unchanged", () => {
    expect(quizAnswersSchema.safeParse({ spending: ["groceries"] }).success).toBe(false);
  });

  it("keeps at most two areas, a third replacing the oldest", () => {
    let picked: string[] = [];
    for (const id of ["groceries", "travel-home", "gas-and-rides"]) picked = toggleCategory(picked, id);
    expect(picked).toEqual(["travel-home", "gas-and-rides"]);
    expect(picked.length).toBeLessThanOrEqual(MAX_CATEGORIES);
    expect(toggleCategory(picked, "travel-home")).toEqual(["gas-and-rides"]);
  });

  it("keeps one amount, and a second tap clears it", () => {
    expect(toggleAmount(null, "under-200")).toBe("under-200");
    expect(toggleAmount("under-200", "over-500")).toBe("over-500");
    expect(toggleAmount("over-500", "over-500")).toBeNull();
  });
});
