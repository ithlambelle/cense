import { describe, expect, it } from "vitest";

import { quizAnswersSchema, spendingBandSchema, spendingCategorySchema } from "../api/schemas";
import { QUESTIONS, type QuizAnswers } from "./questions";
import {
  MAX_CATEGORIES,
  NO_SPENDING,
  QUIZ_STEP_COUNT,
  SAVED_BAND,
  SAVED_CATEGORY,
  sameSpending,
  SPENDING_AMOUNTS,
  SPENDING_CATEGORIES,
  SPENDING_COPY,
  toggleAmount,
  spendingFromAnswers,
  toggleCategory,
  withSpending,
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

  it("maps every option on screen to a saved value, and every saved value back", () => {
    expect(Object.keys(SAVED_CATEGORY)).toEqual(SPENDING_CATEGORIES.map((option) => option.id));
    expect(Object.values(SAVED_CATEGORY)).toEqual(spendingCategorySchema.options);
    expect(Object.keys(SAVED_BAND)).toEqual(SPENDING_AMOUNTS.map((option) => option.id));
    expect(Object.values(SAVED_BAND)).toEqual(spendingBandSchema.options);
  });

  it("saves the picks with the draft, in a shape the API accepts (Ben, Nov 7)", () => {
    const six = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true } as const;
    const saved = withSpending(six, { categories: ["groceries", "food-and-dining"], amount: "200-to-500" });
    expect(saved).toEqual({ ...six, spendingCategories: ["groceries", "food_and_dining"], spendingBand: "200_to_500" });
    expect(quizAnswersSchema.safeParse(saved).success).toBe(true);
    expect(spendingFromAnswers(saved)).toEqual({ categories: ["groceries", "food-and-dining"], amount: "200-to-500" });
  });

  it("clears the saved answer when the picks are cleared", () => {
    const saved: QuizAnswers = { under21: true, spendingCategories: ["groceries"], spendingBand: "over_500" };
    expect(withSpending(saved, NO_SPENDING)).toEqual({ under21: true });
    expect(withSpending(saved, { categories: [], amount: "under-200" })).toEqual({ under21: true, spendingBand: "under_200" });
  });

  it("starts from nothing picked when nothing was saved", () => {
    expect(spendingFromAnswers({ under21: true })).toEqual(NO_SPENDING);
  });

  it("tells when two drafts hold the same spending answer", () => {
    const a = { spendingCategories: ["groceries" as const], spendingBand: "over_500" as const };
    expect(sameSpending(a, { ...a, under21: true })).toBe(true);
    expect(sameSpending({}, {})).toBe(true);
    expect(sameSpending(a, { ...a, spendingBand: "under_200" })).toBe(false);
    expect(sameSpending(a, { spendingBand: "over_500" })).toBe(false);
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
