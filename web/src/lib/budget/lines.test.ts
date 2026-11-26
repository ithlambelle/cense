// Created with Claude Code (2026-11-13).
import { describe, expect, it } from "vitest";

import { buildBudgetLines, coversMonth, lastFullMonth, monthName, summarize } from "./lines";

const row = (category: string | null, categoryDetailed: string | null, outCents: number, inCents = 0) => ({ category, categoryDetailed, outCents, inCents });

const october = {
  month: "2026-10-01",
  incomeCents: 208000,
  totals: [
    row("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", 70000),
    row("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", 30000),
    row("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", 20000),
    row("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", 31000),
  ],
  typed: {},
  setAsideCents: 5000,
  hasBankData: true,
};

describe("buildBudgetLines", () => {
  it("makes one line per category the month had spending in, needs and wants apart", () => {
    const lines = buildBudgetLines(october);
    expect(lines.income).toMatchObject({ label: "Income", amountCents: 208000, bankCents: 208000, typed: false });
    expect(lines.needs.map((line) => [line.label, line.amountCents])).toEqual([
      ["Rent and bills", 70000],
      ["Groceries", 30000],
    ]);
    expect(lines.wants.map((line) => [line.label, line.amountCents])).toEqual([["Eating out", 20000]]);
    expect(lines.saving).toMatchObject({ label: "Saving", amountCents: 5000, typed: true });
  });

  it("keeps a typed number over the bank's, and follows the bank on the other lines", () => {
    const lines = buildBudgetLines({ ...october, typed: { groceries: 25000, income: 150000 } });
    expect(lines.income).toMatchObject({ amountCents: 150000, bankCents: 208000, typed: true });
    expect(lines.needs.find((line) => line.key === "groceries")).toMatchObject({ amountCents: 25000, bankCents: 30000, typed: true });
    expect(lines.needs.find((line) => line.key === "rent_and_bills")).toMatchObject({ amountCents: 70000, typed: false });
  });

  it("keeps a typed line the bank has nothing for this month", () => {
    const lines = buildBudgetLines({ ...october, typed: { travel: 12000 } });
    expect(lines.wants.find((line) => line.key === "travel")).toMatchObject({ amountCents: 12000, bankCents: null, typed: true });
  });

  it("shows income as $0 for a month with none", () => {
    expect(buildBudgetLines({ ...october, incomeCents: null }).income).toMatchObject({ amountCents: 0, bankCents: null, typed: false });
  });

  it("has no Fixed or Changing yet: that waits for the recurring detector", () => {
    const lines = buildBudgetLines(october);
    for (const line of [lines.income, ...lines.needs, ...lines.wants, lines.saving]) expect(line.recurrence).toBeNull();
  });
});

describe("summarize", () => {
  it("is income minus needs, wants and saving", () => {
    // 2,080 - 700 - 300 - 200 - 50 = 830
    expect(summarize(buildBudgetLines(october))).toEqual({ remainingCents: 83000, shortfallCents: 0, fixedOverIncome: false });
  });

  it("uses what the student is typing over the saved numbers", () => {
    expect(summarize(buildBudgetLines(october), { eating_out: 100000 }).remainingCents).toBe(3000);
  });

  it("is short when wants and saving take it below zero, without saying fixed costs passed income", () => {
    const summary = summarize(buildBudgetLines(october), { eating_out: 200000 });
    expect(summary).toEqual({ remainingCents: -97000, shortfallCents: 97000, fixedOverIncome: false });
  });

  it("says needs and fixed wants passed income only when they literally did", () => {
    expect(summarize(buildBudgetLines(october), { rent_and_bills: 190000 }).fixedOverIncome).toBe(true);
    // Every want counts as changing until the detector says otherwise, so a
    // big want alone never makes that line true.
    expect(summarize(buildBudgetLines(october), { eating_out: 900000 }).fixedOverIncome).toBe(false);
  });

  it("counts a wanted line as fixed once the detector marks it recurring", () => {
    const lines = buildBudgetLines(october);
    lines.wants[0] = { ...lines.wants[0], recurrence: "recurring", amountCents: 200000 };
    expect(summarize(lines).fixedOverIncome).toBe(true);
  });
});

describe("months", () => {
  it("names the last full month on the Eastern calendar, across a new year", () => {
    expect(lastFullMonth(new Date("2026-11-13T15:00:00Z"))).toBe("2026-10-01");
    expect(lastFullMonth(new Date("2027-01-02T15:00:00Z"))).toBe("2026-12-01");
    // 11pm on Nov 30 in Boston is already Dec 1 in UTC.
    expect(lastFullMonth(new Date("2026-12-01T04:00:00Z"))).toBe("2026-10-01");
  });

  it("writes a month by name", () => {
    expect(monthName("2026-10-01")).toBe("October");
  });
});

describe("coversMonth", () => {
  it("is a whole month only when the history starts in its first week", () => {
    expect(coversMonth("2026-10-01", "2026-09-12")).toBe(true);
    expect(coversMonth("2026-10-01", "2026-10-08")).toBe(true);
    expect(coversMonth("2026-10-01", "2026-10-09")).toBe(false);
    expect(coversMonth("2026-10-01", null)).toBe(false);
  });
});
