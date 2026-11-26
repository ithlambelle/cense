// Created with Claude Code (2026-11-26). The goal presets and the amounts
// they suggest.
import { describe, expect, it } from "vitest";

import type { BillAnswer } from "@/lib/safe-to-spend/compute";

import { EMERGENCY_FLOOR_CENTS, essentialsCents, FIRST_PRESETS, GOAL_PRESETS, goalName, MAX_GOAL_CENTS, MORE_PRESETS, suggestedAmount } from "./presets";

const answer = (bill: BillAnswer["bill"], coveredBy: BillAnswer["coveredBy"], monthlyCents: number | null): BillAnswer => ({
  bill,
  coveredBy,
  monthlyCents,
  dueDay: monthlyCents === null || bill === "tuition" ? null : 1,
});

const BILLS: BillAnswer[] = [
  answer("rent", "me", 65_000),
  answer("phone", "split", 4_000),
  answer("tuition", "me", 150_000),
  answer("groceries", "me", 27_500),
  answer("car", "none", null),
];

describe("goal presets", () => {
  it("are the five presets and Something else, with no Start investing", () => {
    expect([...GOAL_PRESETS]).toEqual(["emergency_fund", "pay_off_card", "trip", "car", "home", "other"]);
    expect(GOAL_PRESETS as readonly string[]).not.toContain("start_investing");
  });

  it("show three first and the rest behind More goals, each once", () => {
    expect(FIRST_PRESETS).toEqual(["emergency_fund", "pay_off_card", "trip"]);
    expect([...FIRST_PRESETS, ...MORE_PRESETS].sort()).toEqual([...GOAL_PRESETS].sort());
  });
});

describe("essentialsCents", () => {
  it("adds rent, bills and groceries the student pays, without tuition or what family covers", () => {
    expect(essentialsCents(BILLS)).toBe(96_500);
    expect(essentialsCents([answer("rent", "family", null), answer("groceries", "none", null)])).toBe(0);
    expect(essentialsCents([])).toBe(0);
  });
});

describe("suggestedAmount", () => {
  it("suggests one month of essentials for an emergency fund when that is more than $1,000", () => {
    expect(suggestedAmount("emergency_fund", { bills: [...BILLS, answer("car", "me", 20_000)], cardCents: 0 })).toEqual({
      amountCents: 116_500,
      source: "essentials",
    });
  });

  it("suggests $1,000 when a month of essentials is less, or unknown", () => {
    expect(suggestedAmount("emergency_fund", { bills: BILLS, cardCents: 0 })).toEqual({ amountCents: EMERGENCY_FLOOR_CENTS, source: "starter" });
    expect(suggestedAmount("emergency_fund", { bills: [], cardCents: 0 })).toEqual({ amountCents: 100_000, source: "starter" });
    expect(suggestedAmount("emergency_fund", { bills: [answer("rent", "me", 100_000)], cardCents: 0 })?.source).toBe("starter");
  });

  it("suggests the card's balance when the bank shows one", () => {
    expect(suggestedAmount("pay_off_card", { bills: BILLS, cardCents: 31_000 })).toEqual({ amountCents: 31_000, source: "card_balance" });
    expect(suggestedAmount("pay_off_card", { bills: BILLS, cardCents: 0 })).toBeNull();
  });

  it("leaves the other goals for the student to type", () => {
    for (const preset of ["trip", "car", "home", "other"] as const) expect(suggestedAmount(preset, { bills: BILLS, cardCents: 31_000 })).toBeNull();
  });

  it("never suggests more than a goal can be", () => {
    expect(suggestedAmount("pay_off_card", { bills: [], cardCents: MAX_GOAL_CENTS + 1 })?.amountCents).toBe(MAX_GOAL_CENTS);
  });
});

describe("goalName", () => {
  it("names a preset goal itself, whatever was typed", () => {
    expect(goalName("trip", "Anything")).toBe("Trip");
    expect(goalName("pay_off_card", undefined)).toBe("Pay off my card");
  });

  it("keeps a Something else name without invisible characters or surrounding space", () => {
    expect(goalName("other", " \u200bLaptop\u200d ")).toBe("Laptop");
    expect(goalName("other", "Café 2027")).toBe("Café 2027");
    expect(goalName("other", "日本旅行")).toBe("日本旅行");
  });

  it("refuses a name that only looks blank, or is longer than 40", () => {
    for (const typed of ["", "   ", "\u200b\u200c\u200d", "\u2060\ufeff", "\u00a0\u3000", "\u3164", "\u2800\u2800", "\uffa0", "\u115f\u1160", "\u0301", " \u0301\u0308 ", "x".repeat(41), undefined]) {
      expect(goalName("other", typed), JSON.stringify(typed)).toBeNull();
    }
  });
});
