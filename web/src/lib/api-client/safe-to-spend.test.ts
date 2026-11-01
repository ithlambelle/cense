import { describe, expect, it } from "vitest";

import { amountInput, parseAmount } from "./safe-to-spend";

describe("parseAmount", () => {
  it.each([
    ["650", 65_000],
    ["$650", 65_000],
    [" 1,200.50 ", 120_050],
    ["40.5", 4_050],
    ["0", 0],
    ["100000", 10_000_000],
  ])("reads %j as %i cents", (typed, cents) => {
    expect(parseAmount(typed)).toBe(cents);
  });

  it.each(["", "abc", "-5", "1.234", "100001", "1e3", "$", "6 50"])("refuses %j", (typed) => {
    expect(parseAmount(typed)).toBeNull();
  });
});

describe("amountInput", () => {
  it("writes cents back the way a student types them", () => {
    expect(amountInput(65_000)).toBe("650");
    expect(amountInput(4_050)).toBe("40.50");
    expect(amountInput(null)).toBe("");
  });
});
