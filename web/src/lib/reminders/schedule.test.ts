import { describe, expect, it } from "vitest";

import {
  addDays,
  checkAutopayReminder,
  dayInMonth,
  followingReminder,
  nextOnDay,
  nextReminders,
  payDownTargetCents,
} from "./schedule";

describe("dayInMonth", () => {
  it("uses the card's day when the month has it", () => {
    expect(dayInMonth(2026, 11, 15)).toBe("2026-11-15");
    expect(dayInMonth(2026, 12, 31)).toBe("2026-12-31");
  });

  it("falls on the last day of a shorter month", () => {
    expect(dayInMonth(2026, 4, 31)).toBe("2026-04-30");
    expect(dayInMonth(2027, 2, 31)).toBe("2027-02-28");
    expect(dayInMonth(2027, 2, 29)).toBe("2027-02-28");
    expect(dayInMonth(2028, 2, 31)).toBe("2028-02-29"); // leap year
    expect(dayInMonth(2028, 2, 30)).toBe("2028-02-29");
  });

  it("refuses a day that is not 1 to 31", () => {
    expect(() => dayInMonth(2026, 11, 0)).toThrow();
    expect(() => dayInMonth(2026, 11, 32)).toThrow();
    expect(() => dayInMonth(2026, 11, 1.5)).toThrow();
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-03-01", -3)).toBe("2026-02-26");
    expect(addDays("2028-03-01", -3)).toBe("2028-02-27");
    expect(addDays("2027-01-02", -3)).toBe("2026-12-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("refuses impossible dates", () => {
    expect(() => addDays("2027-02-30", 1)).toThrow();
    expect(() => addDays("tomorrow", 1)).toThrow();
  });
});

describe("nextOnDay", () => {
  it("is today when today is the card's day", () => {
    expect(nextOnDay(24, "2026-10-24")).toBe("2026-10-24");
  });

  it("is later this month, or next month once this month's day has passed", () => {
    expect(nextOnDay(28, "2026-10-24")).toBe("2026-10-28");
    expect(nextOnDay(5, "2026-10-24")).toBe("2026-11-05");
    expect(nextOnDay(5, "2026-12-24")).toBe("2027-01-05");
  });

  it("clamps day 31 in short months", () => {
    expect(nextOnDay(31, "2027-02-10")).toBe("2027-02-28");
    expect(nextOnDay(31, "2026-04-30")).toBe("2026-04-30");
    expect(nextOnDay(30, "2027-02-28")).toBe("2027-02-28");
  });
});

describe("nextReminders", () => {
  const card = { statementClosingDay: 10, paymentDueDay: 5 };

  it("schedules each 3 days before, earliest first", () => {
    expect(nextReminders(card, "2026-10-24")).toEqual([
      { kind: "payment_due", occurrence: "2026-11-05", remindOn: "2026-11-02" },
      { kind: "statement_closing", occurrence: "2026-11-10", remindOn: "2026-11-07" },
    ]);
  });

  it("sends today when the 3-day mark already passed", () => {
    expect(nextReminders({ statementClosingDay: 25, paymentDueDay: 26 }, "2026-10-24")).toEqual([
      { kind: "statement_closing", occurrence: "2026-10-25", remindOn: "2026-10-24" },
      { kind: "payment_due", occurrence: "2026-10-26", remindOn: "2026-10-24" },
    ]);
  });

  it("lands 3 days before the end of February for day 31", () => {
    expect(nextReminders({ statementClosingDay: 31, paymentDueDay: 31 }, "2027-02-01")[0]).toEqual({
      kind: "statement_closing",
      occurrence: "2027-02-28",
      remindOn: "2027-02-25",
    });
  });

  it("refuses an impossible today", () => {
    expect(() => nextReminders(card, "2026-02-30")).toThrow();
  });
});

describe("checkAutopayReminder", () => {
  it("is the day after the first statement closes", () => {
    expect(checkAutopayReminder({ statementClosingDay: 10, paymentDueDay: 5 }, "2026-10-24")).toEqual({
      kind: "check_autopay",
      occurrence: "2026-11-10",
      remindOn: "2026-11-11",
    });
    expect(checkAutopayReminder({ statementClosingDay: 31, paymentDueDay: 5 }, "2026-12-31")).toEqual({
      kind: "check_autopay",
      occurrence: "2026-12-31",
      remindOn: "2027-01-01",
    });
  });
});

describe("followingReminder", () => {
  const card = { statementClosingDay: 31, paymentDueDay: 15 };

  it("moves to the next month and keeps the card's day once it exists again", () => {
    const jan = { kind: "statement_closing" as const, occurrence: "2027-01-31", remindOn: "2027-01-28" };
    const feb = followingReminder(card, jan);
    expect(feb).toEqual({ kind: "statement_closing", occurrence: "2027-02-28", remindOn: "2027-02-25" });
    expect(followingReminder(card, feb!)).toEqual({ kind: "statement_closing", occurrence: "2027-03-31", remindOn: "2027-03-28" });
  });

  it("crosses the year", () => {
    const dec = { kind: "payment_due" as const, occurrence: "2026-12-15", remindOn: "2026-12-12" };
    expect(followingReminder(card, dec)).toEqual({ kind: "payment_due", occurrence: "2027-01-15", remindOn: "2027-01-12" });
  });

  it("does not repeat the one-time autopay check", () => {
    expect(followingReminder(card, { kind: "check_autopay", occurrence: "2026-11-30", remindOn: "2026-12-01" })).toBeNull();
  });
});

describe("payDownTargetCents", () => {
  it("is 30% of the limit, rounded down to whole cents", () => {
    expect(payDownTargetCents(75_000)).toBe(22_500); // $750 limit -> $225
    expect(payDownTargetCents(33_333)).toBe(9_999);
    expect(payDownTargetCents(0)).toBe(0);
  });

  it("refuses a negative or fractional limit", () => {
    expect(() => payDownTargetCents(-1)).toThrow();
    expect(() => payDownTargetCents(10.5)).toThrow();
  });
});
