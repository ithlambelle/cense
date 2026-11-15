import { describe, expect, it } from "vitest";

import { computeBudget, monthlyFromIncome } from "./budget";
import type { BudgetInput } from "./budget";

// Test data for the waterfall arithmetic only, from draft PR #86. Never shown
// to a student: Ben decided no budgeting on made-up data (Nov 4), so these
// live here and nowhere in the app.
const dollars = (amount: number) => amount * 100;

// Weekly pay of $480 is about $2,080 a month. Needs and recurring wants leave
// a surplus of $858, and the student's own choices leave $238.
const SAM_WITH_SURPLUS: BudgetInput = {
  income: { amountCents: dollars(480), cadence: "weekly" },
  expenses: [
    { id: "rent", label: "Rent", necessity: "need", recurrence: "recurring", monthlyCents: dollars(700) },
    { id: "insurance", label: "Insurance", necessity: "need", recurrence: "recurring", monthlyCents: dollars(40) },
    { id: "phone", label: "Phone bill", necessity: "need", recurrence: "recurring", monthlyCents: dollars(100) },
    { id: "spotify", label: "Spotify", necessity: "want", recurrence: "recurring", monthlyCents: dollars(12) },
    { id: "disney", label: "Disney+", necessity: "want", recurrence: "recurring", monthlyCents: dollars(20) },
    { id: "groceries", label: "Groceries", necessity: "need", recurrence: "variable", monthlyCents: dollars(300) },
    { id: "gas", label: "Gas", necessity: "need", recurrence: "variable", monthlyCents: dollars(50) },
    { id: "eating-out", label: "Eating out with friends", necessity: "want", recurrence: "variable", monthlyCents: dollars(200) },
    { id: "work-lunch", label: "Buying lunch at work", necessity: "want", recurrence: "variable", monthlyCents: dollars(70) },
  ],
  savings: [
    { id: "investing", label: "Investing", monthlyCents: dollars(200) },
    { id: "savings", label: "Savings account", monthlyCents: dollars(100) },
    { id: "emergency", label: "Emergency fund", monthlyCents: dollars(50) },
  ],
};

// $150 a week is about $650 a month, which rent, insurance, phone and
// groceries alone pass. The fixed costs are already more than the income, so
// there is no surplus to allocate and the screen has to say so plainly.
const JORDAN_OVER_BUDGET: BudgetInput = {
  income: { amountCents: dollars(150), cadence: "weekly" },
  expenses: [
    { id: "rent", label: "Rent", necessity: "need", recurrence: "recurring", monthlyCents: dollars(700) },
    { id: "insurance", label: "Insurance", necessity: "need", recurrence: "recurring", monthlyCents: dollars(40) },
    { id: "phone", label: "Phone bill", necessity: "need", recurrence: "recurring", monthlyCents: dollars(100) },
    { id: "groceries", label: "Groceries", necessity: "need", recurrence: "variable", monthlyCents: dollars(300) },
    { id: "gas", label: "Gas", necessity: "need", recurrence: "variable", monthlyCents: dollars(50) },
    { id: "spotify", label: "Spotify", necessity: "want", recurrence: "recurring", monthlyCents: dollars(12) },
  ],
  savings: [{ id: "emergency", label: "Emergency fund", monthlyCents: dollars(50) }],
};


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
