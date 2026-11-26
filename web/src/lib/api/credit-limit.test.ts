// Created with Claude Code (2026-11-26). The credit limit rule: the form and
// the API accept exactly the same limits, and a saved limit outside the rule
// reads as none.
import { describe, expect, it, vi } from "vitest";

import { centsToInput } from "../money";
import { creditLimitCentsSchema, savedCreditLimitCents, typedCreditLimitCents } from "./credit-limit";
import { createApplicationSchema, updateApplicationSchema } from "./schemas";

const EDGES = [0, 1, 50, 99, 100, 101, 50_000, 9_999_999, 10_000_000, 10_000_001, 100_000_000];

describe("the credit limit rule", () => {
  it.each(EDGES)("the form and the API agree on %i cents", (cents) => {
    const api = creditLimitCentsSchema.safeParse(cents).success;
    expect(typedCreditLimitCents(centsToInput(cents)) !== undefined).toBe(api);
    expect(typedCreditLimitCents("$" + centsToInput(cents)) !== undefined).toBe(api);
    expect(createApplicationSchema.safeParse({ cardId: null, cardName: "Card", status: "approved", creditLimitCents: cents }).success).toBe(api);
    expect(updateApplicationSchema.safeParse({ creditLimitCents: cents }).success).toBe(api);
  });

  it("is $1 to $100,000, or no limit", () => {
    expect(typedCreditLimitCents("0")).toBeUndefined();
    expect(typedCreditLimitCents("$0.00")).toBeUndefined();
    expect(typedCreditLimitCents("1")).toBe(100);
    expect(typedCreditLimitCents("100,000")).toBe(10_000_000);
    expect(typedCreditLimitCents("")).toBeNull();
    expect(updateApplicationSchema.safeParse({ creditLimitCents: null }).success).toBe(true);
    expect(updateApplicationSchema.safeParse({ creditLimitCents: 100.5 }).success).toBe(false);
  });

  it("reads a saved limit outside the rule as none, and says so in the log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(savedCreditLimitCents(0)).toBeNull();
    expect(savedCreditLimitCents("0")).toBeNull();
    expect(savedCreditLimitCents(-500)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({ event: "credit_limit_ignored", reason: "outside_rule" });
    warn.mockClear();
    expect(savedCreditLimitCents(50_000)).toBe(50_000);
    expect(savedCreditLimitCents("125050")).toBe(125_050);
    expect(savedCreditLimitCents(null)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
