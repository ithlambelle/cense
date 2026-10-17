import { describe, expect, it } from "vitest";

import { annualFeeLine, GUIDANCE_LINE, RESULT_DISCLAIMER, RESULT_HEADLINES, TIER_LABELS } from "./results";

describe("result wording", () => {
  it("keeps the guidance line word for word", () => {
    expect(GUIDANCE_LINE).toBe(
      "This is guidance from what you told us and what the issuer publishes. It is not a guarantee. Issuers also weigh things this tool does not score, including your income. The issuer's own preapproval check is the real test.",
    );
  });

  it("never promises approval", () => {
    const text = [GUIDANCE_LINE, RESULT_DISCLAIMER, ...Object.values(TIER_LABELS), ...Object.values(RESULT_HEADLINES)]
      .join(" ")
      .toLowerCase();
    expect(text).not.toMatch(/approved|you will get|guaranteed/);
  });

  it("names the three tiers", () => {
    expect(TIER_LABELS).toEqual({ likely_fit: "Likely fit", stretch: "Stretch", not_yet: "Not yet" });
  });

  it("writes the annual fee from whole cents", () => {
    expect(annualFeeLine(0)).toBe("No annual fee");
    expect(annualFeeLine(3900)).toBe("$39 annual fee");
    expect(annualFeeLine(9950)).toBe("$99.50 annual fee");
  });
});
