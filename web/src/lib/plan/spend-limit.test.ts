import { describe, expect, it } from "vitest";

import { SPEND_LIMIT_PERCENT, SPEND_LIMIT_SOURCES, suggestedSpendLimitCents } from "./spend-limit";

describe("suggestedSpendLimitCents", () => {
  it("is 30% of the credit limit", () => {
    expect(SPEND_LIMIT_PERCENT).toBe(30);
    expect(suggestedSpendLimitCents(50_000)).toBe(15_000);
    expect(suggestedSpendLimitCents(75_000)).toBe(22_500);
    expect(suggestedSpendLimitCents(150_000)).toBe(45_000);
  });

  it("rounds down to whole dollars, so it never goes over 30%", () => {
    // $333.33 x 30% = $99.999
    expect(suggestedSpendLimitCents(33_333)).toBe(9_900);
    // $1,234 x 30% = $370.20
    expect(suggestedSpendLimitCents(123_400)).toBe(37_000);
    for (const limit of [1, 99, 33_333, 123_456, 987_654]) {
      const suggested = suggestedSpendLimitCents(limit);
      expect(suggested).not.toBeNull();
      expect(suggested!).toBeLessThanOrEqual((limit * 30) / 100);
    }
  });

  it("keeps the cents when the limit is too small for a whole dollar", () => {
    expect(suggestedSpendLimitCents(300)).toBe(90);
  });

  it("has nothing to suggest without a limit", () => {
    expect(suggestedSpendLimitCents(null)).toBeNull();
    expect(suggestedSpendLimitCents(0)).toBeNull();
    expect(suggestedSpendLimitCents(-100)).toBeNull();
    expect(suggestedSpendLimitCents(1.5)).toBeNull();
  });

  it("links only to https sources", () => {
    for (const source of SPEND_LIMIT_SOURCES) expect(source.url.startsWith("https://")).toBe(true);
  });
});
