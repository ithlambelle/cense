import { describe, expect, it } from "vitest";

import {
  computeBudget,
  monthlyFromIncome,
  perPaycheck,
  withMonthlyAmount,
} from "./budget";
import { JORDAN_OVER_BUDGET, SAM_WITH_SURPLUS } from "./personas";

describe("monthlyFromIncome", () => {
  it("turns weekly pay into 52/12 paychecks a month, not 4", () => {
    expect(monthlyFromIncome({ amountCents: 48000, cadence: "weekly" })).toBe(
      208000,
    );
    expect(monthlyFromIncome({ amountCents: 15000, cadence: "weekly" })).toBe(
      65000,
    );
  });

  it("handles the other cadences", () => {
    expect(
      monthlyFromIncome({ amountCents: 100000, cadence: "biweekly" }),
    ).toBe(216667);
    expect(
      monthlyFromIncome({ amountCents: 100000, cadence: "semimonthly" }),
    ).toBe(200000);
    expect(monthlyFromIncome({ amountCents: 250000, cadence: "monthly" })).toBe(
      250000,
    );
  });

  it("rejects an amount that is not whole cents or is negative", () => {
    expect(() =>
      monthlyFromIncome({ amountCents: 10.5, cadence: "weekly" }),
    ).toThrow(RangeError);
    expect(() =>
      monthlyFromIncome({ amountCents: -1, cadence: "weekly" }),
    ).toThrow(RangeError);
  });
});

describe("perPaycheck", () => {
  it("divides a monthly amount by the paychecks in it", () => {
    expect(perPaycheck(208000, "weekly")).toBe(48000);
    expect(perPaycheck(200000, "semimonthly")).toBe(100000);
    expect(perPaycheck(250000, "monthly")).toBe(250000);
  });

  it("rounds to the cent", () => {
    // $100 a month over 52 weeks is 12 / 52 of $100.
    expect(perPaycheck(10000, "weekly")).toBe(2308);
  });
});

describe("computeBudget", () => {
  it("follows the template order for a student with money left over", () => {
    expect(computeBudget(SAM_WITH_SURPLUS)).toEqual({
      incomeCents: 208000,
      recurringNeedsCents: 84000,
      variableNeedsCents: 35000,
      recurringWantsCents: 3200,
      surplusCents: 85800,
      variableWantsCents: 27000,
      savingsCents: 35000,
      remainingCents: 23800,
      shortfallCents: 0,
    });
  });

  it("reports a shortfall, with no surplus, when needs alone are too much", () => {
    const result = computeBudget(JORDAN_OVER_BUDGET);
    expect(result.incomeCents).toBe(65000);
    expect(result.surplusCents).toBeLessThan(0);
    expect(result.remainingCents).toBeLessThan(0);
    expect(result.shortfallCents).toBe(-result.remainingCents);
  });

  it("is zero for an empty budget with income", () => {
    const result = computeBudget({
      income: { amountCents: 100000, cadence: "monthly" },
      expenses: [],
      savings: [],
    });
    expect(result.surplusCents).toBe(100000);
    expect(result.remainingCents).toBe(100000);
    expect(result.shortfallCents).toBe(0);
  });

  it("counts every expense in exactly one group", () => {
    const result = computeBudget(SAM_WITH_SURPLUS);
    const everything = SAM_WITH_SURPLUS.expenses.reduce(
      (total, expense) => total + expense.monthlyCents,
      0,
    );
    expect(
      result.recurringNeedsCents +
        result.variableNeedsCents +
        result.recurringWantsCents +
        result.variableWantsCents,
    ).toBe(everything);
  });

  it("rejects an expense that is not whole cents", () => {
    expect(() =>
      computeBudget({
        income: { amountCents: 100000, cadence: "monthly" },
        expenses: [
          {
            id: "x",
            label: "Bad",
            necessity: "need",
            recurrence: "recurring",
            monthlyCents: 12.5,
          },
        ],
        savings: [],
      }),
    ).toThrow(RangeError);
  });
});

describe("withMonthlyAmount", () => {
  it("shows the other side of cutting a want: more is left over", () => {
    const before = computeBudget(SAM_WITH_SURPLUS);
    const after = computeBudget(
      withMonthlyAmount(SAM_WITH_SURPLUS, "eating-out", 10000),
    );
    expect(after.variableWantsCents).toBe(before.variableWantsCents - 10000);
    expect(after.remainingCents).toBe(before.remainingCents + 10000);
    expect(after.surplusCents).toBe(before.surplusCents);
  });

  it("changes a savings goal the same way", () => {
    const after = computeBudget(
      withMonthlyAmount(SAM_WITH_SURPLUS, "investing", 30000),
    );
    expect(after.savingsCents).toBe(45000);
    expect(after.remainingCents).toBe(13800);
  });

  it("does not change the budget it was given", () => {
    const copy = structuredClone(SAM_WITH_SURPLUS);
    withMonthlyAmount(SAM_WITH_SURPLUS, "rent", 1);
    expect(SAM_WITH_SURPLUS).toEqual(copy);
  });

  it("leaves the budget alone for an id it does not know", () => {
    expect(withMonthlyAmount(SAM_WITH_SURPLUS, "nope", 1)).toEqual(
      SAM_WITH_SURPLUS,
    );
  });
});
