// Created with Claude Code (2026-11-26). The plan for a goal: months left,
// the monthly set-aside rounded up, and Your plan's four lines.
import { describe, expect, it } from "vitest";

import type { BillAnswer } from "@/lib/safe-to-spend/compute";

import { addMonthsIso, DEFAULT_MONTHS, easternToday, monthlySetAside, monthsLeft, planAtSave, planSummary } from "./plan";

describe("monthsLeft", () => {
  it("uses 6 months when the goal has no date", () => {
    expect(monthsLeft("2026-11-26", null)).toBe(DEFAULT_MONTHS);
  });

  it("counts whole months, once the day comes round", () => {
    expect(monthsLeft("2026-11-26", "2027-05-26")).toBe(6);
    expect(monthsLeft("2026-11-26", "2027-05-25")).toBe(5);
    expect(monthsLeft("2026-11-26", "2027-11-26")).toBe(12);
    expect(monthsLeft("2026-11-26", "2028-01-27")).toBe(14);
  });

  it("leaves one month for a date this month, today, or already past", () => {
    expect(monthsLeft("2026-11-26", "2026-12-25")).toBe(1);
    expect(monthsLeft("2026-11-26", "2026-11-30")).toBe(1);
    expect(monthsLeft("2026-11-26", "2026-11-26")).toBe(1);
    expect(monthsLeft("2026-11-26", "2026-10-01")).toBe(1);
    expect(monthsLeft("2026-11-26", "2020-01-01")).toBe(1);
  });

  it("treats a month's last day as a whole month from a later day", () => {
    expect(monthsLeft("2027-01-31", "2027-02-28")).toBe(1);
    expect(monthsLeft("2027-01-30", "2027-02-28")).toBe(1);
    expect(monthsLeft("2028-01-31", "2028-02-29")).toBe(1);
    expect(monthsLeft("2027-01-28", "2027-02-27")).toBe(1);
    expect(monthsLeft("2027-01-31", "2027-04-30")).toBe(3);
    expect(monthsLeft("2027-01-31", "2027-04-29")).toBe(2);
  });

  it("crosses a year", () => {
    expect(monthsLeft("2026-12-15", "2027-01-15")).toBe(1);
    expect(monthsLeft("2026-12-15", "2027-06-14")).toBe(5);
  });
});

describe("monthlySetAside", () => {
  it("rounds up to the cent, so the goal is never a cent short", () => {
    expect(monthlySetAside(124_000, 6)).toBe(20_667);
    expect(monthlySetAside(120_000, 6)).toBe(20_000);
    expect(monthlySetAside(100, 3)).toBe(34);
    expect(monthlySetAside(20_667 * 6, 6) * 6).toBeGreaterThanOrEqual(124_000);
  });

  it("sets aside at least a cent when the amount is smaller than the months", () => {
    expect(monthlySetAside(5, 6)).toBe(1);
    expect(monthlySetAside(1, 360)).toBe(1);
  });

  it("is the whole amount over one month", () => {
    expect(monthlySetAside(60_000, 1)).toBe(60_000);
  });

  it("refuses amounts and months that are not real", () => {
    expect(() => monthlySetAside(0, 6)).toThrow(RangeError);
    expect(() => monthlySetAside(10.5, 6)).toThrow(RangeError);
    expect(() => monthlySetAside(100, 0)).toThrow(RangeError);
  });
});

describe("planAtSave", () => {
  it("fixes a goal with no date at 6 months from the day it is saved, so it never moves", () => {
    expect(planAtSave({ amountCents: 124_000, targetDate: null }, "2026-11-26")).toEqual({ targetDate: "2027-05-26", monthlyCents: 20_667 });
  });

  it("ends on the month's last day when 6 months on is shorter", () => {
    expect(planAtSave({ amountCents: 60_000, targetDate: null }, "2026-08-31").targetDate).toBe("2027-02-28");
  });

  it("keeps the goal's own date and spreads the amount over the months left", () => {
    expect(planAtSave({ amountCents: 60_000, targetDate: "2027-03-01" }, "2026-11-26")).toEqual({ targetDate: "2027-03-01", monthlyCents: 20_000 });
  });
});

describe("addMonthsIso and easternToday", () => {
  it("adds months on the calendar", () => {
    expect(addMonthsIso("2026-11-26", 6)).toBe("2027-05-26");
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2026-12-01", 12 * 30)).toBe("2056-12-01");
  });

  it("reads today on Eastern time, not UTC", () => {
    // 2am UTC on Nov 27 is still Nov 26 in Boston.
    expect(easternToday(new Date("2026-11-27T02:00:00Z"))).toBe("2026-11-26");
    expect(easternToday(new Date("2026-11-27T06:00:00Z"))).toBe("2026-11-27");
  });
});

describe("planSummary", () => {
  const bills: BillAnswer[] = [
    { bill: "rent", coveredBy: "me", monthlyCents: 65_000, dueDay: 6 },
    { bill: "phone", coveredBy: "split", monthlyCents: 4_000, dueDay: 2 },
    { bill: "tuition", coveredBy: "family", monthlyCents: null, dueDay: null },
    { bill: "groceries", coveredBy: "me", monthlyCents: 27_500, dueDay: 31 },
    { bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null },
  ];

  it("adds the bills the student pays, whatever their due day, and leaves the rest", () => {
    expect(planSummary({ incomeCents: 210_000, bills, setAsideCents: 20_667 })).toEqual({
      incomeCents: 210_000,
      billsCents: 96_500,
      setAsideCents: 20_667,
      leftCents: 92_833,
    });
  });

  it("goes below zero when the plan is more than comes in", () => {
    expect(planSummary({ incomeCents: 50_000, bills, setAsideCents: 20_667 }).leftCents).toBe(-67_167);
  });

  it("leaves what is left out when the bank has shown no money in", () => {
    expect(planSummary({ incomeCents: null, bills, setAsideCents: 100 })).toEqual({ incomeCents: null, billsCents: 96_500, setAsideCents: 100, leftCents: null });
  });
});
