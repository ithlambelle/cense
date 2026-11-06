import { describe, expect, it } from "vitest";

import { centsToInput, dollarsToCents, moneyAmount } from "./money";

describe("moneyAmount", () => {
  it("writes whole dollars without cents", () => {
    expect(moneyAmount(0)).toBe("$0");
    expect(moneyAmount(4900)).toBe("$49");
    expect(moneyAmount(50000)).toBe("$500");
  });

  it("shows cents only when the amount has some", () => {
    expect(moneyAmount(9950)).toBe("$99.50");
    expect(moneyAmount(50005)).toBe("$500.05");
  });

  it("separates thousands, with or without cents", () => {
    expect(moneyAmount(150000)).toBe("$1,500");
    expect(moneyAmount(150050)).toBe("$1,500.50");
    expect(moneyAmount(10_000_000)).toBe("$100,000");
  });
});

describe("dollarsToCents", () => {
  const range = { minCents: 0, maxCents: 10_000_000 };

  it.each([
    ["650", 65_000],
    ["$650", 65_000],
    [" $ 650 ", 65_000],
    ["1,000", 100_000],
    ["12,345.50", 1_234_550],
    ["$100,000", 10_000_000],
    ["1000", 100_000],
    ["40.5", 4_050],
    ["0.07", 7],
    ["25.", 2_500],
    ["0", 0],
  ])("reads %j as %i cents", (typed, cents) => {
    expect(dollarsToCents(typed, range)).toBe(cents);
  });

  it("counts cents exactly where multiplying by 100 would not", () => {
    // 1.15 * 100 is 114.99999999999999 and 0.29 * 100 is 28.999999999999996.
    expect(dollarsToCents("1.15", range)).toBe(115);
    expect(dollarsToCents("0.29", range)).toBe(29);
    expect(dollarsToCents("4.35", range)).toBe(435);
  });

  it.each(["12,34", "1,25", "1,0000", "1,000,00", ",650", "650,", "6,5,0"])("refuses the misplaced commas in %j", (typed) => {
    expect(dollarsToCents(typed, range)).toBeNull();
  });

  it.each(["", " ", "$", "$.", ".", ".5", "1.234", "-5", "$-5", "1e3", "0x10", "6 50", "650$", "$$650", "five hundred", "Infinity"])(
    "refuses %j",
    (typed) => {
      expect(dollarsToCents(typed, range)).toBeNull();
    },
  );

  it("keeps to the range it is given", () => {
    expect(dollarsToCents("0.99", { minCents: 100, maxCents: 10_000_000 })).toBeNull();
    expect(dollarsToCents("1", { minCents: 100, maxCents: 10_000_000 })).toBe(100);
    expect(dollarsToCents("100,000.01", range)).toBeNull();
    expect(dollarsToCents("99999999999999999999", range)).toBeNull();
  });
});

describe("centsToInput", () => {
  it("writes cents back the way a student types them", () => {
    expect(centsToInput(65_000)).toBe("650");
    expect(centsToInput(4_050)).toBe("40.50");
    expect(centsToInput(7)).toBe("0.07");
    expect(centsToInput(null)).toBe("");
  });
});
