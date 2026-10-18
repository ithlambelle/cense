import { describe, expect, it } from "vitest";

import { applyLabel, HAND_OFF_LINE, safeIssuerUrl } from "./issuer";

describe("issuer hand-off", () => {
  it("names the issuer on the apply button", () => {
    expect(applyLabel("Discover")).toBe("Apply on Discover’s site");
  });

  it("says what Cense does not do, and that preapproval is no guarantee", () => {
    expect(HAND_OFF_LINE).toContain("doesn’t submit applications");
    expect(HAND_OFF_LINE).toContain("not a guarantee of approval");
  });

  it("opens only https addresses", () => {
    expect(safeIssuerUrl("https://www.discover.com/apply")).toBe("https://www.discover.com/apply");
  });

  it.each([
    "http://www.discover.com/apply",
    "javascript:alert(1)",
    "data:text/html,hi",
    "//evil.example",
    "/relative",
    "",
    "not a url",
  ])("refuses %j", (value) => {
    expect(safeIssuerUrl(value)).toBeNull();
  });
});
