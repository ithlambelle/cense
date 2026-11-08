// Created with Claude Code (2026-11-08).
import { describe, expect, it } from "vitest";

import { AUTOPAY_ANSWERS, nextPaymentLabel, paymentTypeLabel, setupProgress } from "./progress";

const base = {
  autopayStatus: "unknown",
  statementClosingDay: null,
  paymentDueDay: null,
  spendLimitStep: false,
  reminderStep: false,
  reminderOn: false,
};

describe("setupProgress", () => {
  it("starts with nothing done", () => {
    expect(setupProgress(base)).toEqual({ dates: false, autopay: false, spendLimit: false, reminders: false });
  });

  it("needs both days for the dates row", () => {
    expect(setupProgress({ ...base, statementClosingDay: 12 }).dates).toBe(false);
    expect(setupProgress({ ...base, statementClosingDay: 12, paymentDueDay: 6 }).dates).toBe(true);
  });

  it("lights autopay only when it is on", () => {
    expect(setupProgress({ ...base, autopayStatus: "off" }).autopay).toBe(false);
    expect(setupProgress({ ...base, autopayStatus: "on" }).autopay).toBe(true);
  });

  it("lights reminders only with the saved step and a reminder that is really on, as Home does", () => {
    expect(setupProgress({ ...base, reminderStep: true }).reminders).toBe(false);
    expect(setupProgress({ ...base, reminderOn: true }).reminders).toBe(false);
    expect(setupProgress({ ...base, reminderStep: true, reminderOn: true }).reminders).toBe(true);
  });

  it("lights the spend limit from its step", () => {
    expect(setupProgress({ ...base, spendLimitStep: true }).spendLimit).toBe(true);
  });
});

describe("the autopay answers and summary", () => {
  it("offers the frame's four answers in order", () => {
    expect(AUTOPAY_ANSWERS.map((answer) => answer.label)).toEqual([
      "Yes, the full statement balance",
      "Yes, the minimum only",
      "Yes, a fixed amount",
      "Not yet",
    ]);
  });

  it("names the payment type without an amount", () => {
    expect(paymentTypeLabel("statement_balance")).toBe("Statement balance");
    expect(paymentTypeLabel("minimum")).toBe("Minimum only");
    expect(paymentTypeLabel("fixed_amount")).toBe("A fixed amount");
    expect(paymentTypeLabel(null)).toBeNull();
  });

  it("gives the next due date on or after today", () => {
    expect(nextPaymentLabel(6, "2026-11-08")).toBe("Dec 6");
    expect(nextPaymentLabel(8, "2026-11-08")).toBe("Nov 8");
    expect(nextPaymentLabel(31, "2026-11-08")).toBe("Nov 30");
    expect(nextPaymentLabel(null, "2026-11-08")).toBeNull();
  });
});
