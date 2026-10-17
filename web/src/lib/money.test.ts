import { describe, expect, it } from "vitest";

import { moneyAmount } from "./money";

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
