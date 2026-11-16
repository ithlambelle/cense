import { describe, expect, it } from "vitest";

import { MAX_AMOUNT_CENTS, parseDollarsToCents } from "./amount";

describe("parseDollarsToCents", () => {
  it("reads whole dollars and cents", () => {
    expect(parseDollarsToCents("0")).toBe(0);
    expect(parseDollarsToCents("25")).toBe(2500);
    expect(parseDollarsToCents("25.5")).toBe(2550);
    expect(parseDollarsToCents("25.50")).toBe(2550);
    expect(parseDollarsToCents("0.07")).toBe(7);
  });

  it("allows a dollar sign, spaces around it and thousands commas", () => {
    expect(parseDollarsToCents(" $1,200 ")).toBe(120000);
    expect(parseDollarsToCents("$ 12,000.50")).toBe(1200050);
  });

  it("lets a trailing point through while someone is still typing", () => {
    expect(parseDollarsToCents("25.")).toBe(2500);
  });

  it("rejects anything that is not an amount", () => {
    for (const text of ["", " ", "abc", "-5", "1.234", "1,2,3", "12,34", ".5", "5e3", "1 000", "$$5", "0x10"]) {
      expect(parseDollarsToCents(text), text).toBeNull();
    }
  });

  it("rejects an amount past the cap, and accepts the cap itself", () => {
    expect(parseDollarsToCents("1,000,000")).toBe(MAX_AMOUNT_CENTS);
    expect(parseDollarsToCents("1,000,000.01")).toBeNull();
    expect(parseDollarsToCents("99999999999999999999")).toBeNull();
  });
});
