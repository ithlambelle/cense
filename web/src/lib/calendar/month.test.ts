// Created with Claude Code (2026-11-21). The Calendar (Figma C1, 821:9293):
// the month grid, the dots, and how each row reads.
import { describe, expect, it } from "vitest";

import type { ComingUpCard, ComingUpEvent } from "@/lib/home/coming-up";

import { calendarEntry, dayLabel, dotsByDate, longDay, monthName, monthRange, monthWeeks } from "./month";

const discover: ComingUpCard = {
  applicationId: "00000000-0000-4000-8000-000000000001",
  name: "Discover",
  creditLimitCents: 50_000,
  statementClosingDay: 18,
  paymentDueDay: 12,
  autopayStatus: "on",
};

describe("the month", () => {
  it("runs from the 1st to the last day, across a year end and a leap February", () => {
    expect(monthRange("2026-11-11")).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    expect(monthRange("2026-12-31")).toEqual({ first: "2026-12-01", last: "2026-12-31" });
    expect(monthRange("2028-02-10")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(monthName("2026-11-11")).toBe("November");
  });

  // November 2026 starts on a Sunday, as the frame draws it: five rows, the
  // last with the 29th and 30th then five blanks.
  it("lays the days out Sunday first, with blanks around the month", () => {
    const weeks = monthWeeks("2026-11-11");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks[4]).toEqual(["2026-11-29", "2026-11-30", null, null, null, null, null]);
    // December 2026 starts on a Tuesday.
    expect(monthWeeks("2026-12-05")[0].slice(0, 3)).toEqual([null, null, "2026-12-01"]);
  });
});

describe("dots", () => {
  it("shows one dot per kind on a day, in the legend's order", () => {
    const dots = dotsByDate([
      { date: "2026-11-15", dot: "money" },
      { date: "2026-11-15", dot: "bill" },
      { date: "2026-11-15", dot: "bill" },
      { date: "2026-11-12", dot: "card" },
    ]);
    expect(dots.get("2026-11-15")).toEqual(["bill", "money"]);
    expect(dots.get("2026-11-12")).toEqual(["card"]);
    expect(dots.get("2026-11-13")).toBeUndefined();
  });
});

describe("labels", () => {
  it("names today, tomorrow, then the weekday and date, as the frame's rows begin", () => {
    expect(dayLabel("2026-11-11", "2026-11-11")).toBe("Today");
    expect(dayLabel("2026-11-12", "2026-11-11")).toBe("Tomorrow");
    expect(dayLabel("2026-11-15", "2026-11-11")).toBe("Sun, Nov 15");
    expect(longDay("2026-11-15")).toBe("Sunday, November 15");
  });
});

describe("calendarEntry", () => {
  it.each<[ComingUpEvent, { what: string; subtitle: string; dot: string; sensitive: boolean }]>([
    [
      { kind: "payment_due", date: "2026-11-12", card: discover },
      { what: "Payment due", subtitle: "Discover · autopay is on", dot: "card", sensitive: false },
    ],
    [
      { kind: "statement_closes", date: "2026-11-18", card: discover, payDownToCents: 15_000 },
      { what: "Statement closes", subtitle: "Discover · pay down to $150", dot: "card", sensitive: true },
    ],
    [
      { kind: "bill", date: "2026-11-15", bill: "rent", share: false, amountCents: 65_000 },
      { what: "Rent", subtitle: "$650 · you cover it", dot: "bill", sensitive: true },
    ],
    [
      { kind: "bill", date: "2026-11-01", bill: "phone", share: true, amountCents: 2_250 },
      { what: "Phone", subtitle: "$22.50 · your share", dot: "bill", sensitive: true },
    ],
    [
      { kind: "paycheck", date: "2026-11-15", amountCents: 48_000 },
      { what: "Paycheck", subtitle: "$480 · looks like pay", dot: "money", sensitive: true },
    ],
  ])("reads %o as the frame's row", (event, expected) => {
    expect(calendarEntry(event)).toMatchObject({ date: event.date, ...expected });
  });

  it("never says autopay is off when the student has not said", () => {
    expect(calendarEntry({ kind: "payment_due", date: "2026-11-12", card: { ...discover, autopayStatus: "unknown" } }).subtitle).toBe(
      "Discover · turn on autopay",
    );
  });
});
