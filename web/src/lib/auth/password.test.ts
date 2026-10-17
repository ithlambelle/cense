import { describe, expect, it } from "vitest";

import { looksLikeEmail, passwordProblem } from "./password";

describe("password checks", () => {
  it("asks for length only, with no rule about numbers or symbols", () => {
    expect(passwordProblem("short1")).toBe("Use at least 8 characters.");
    expect(passwordProblem("correcthorse")).toBeNull();
    expect(passwordProblem("x".repeat(129))).toBe("Use 128 characters or fewer.");
  });

  it("catches an email that is clearly unfinished", () => {
    expect(looksLikeEmail("alex@")).toBe(false);
    expect(looksLikeEmail("alex@email.com")).toBe(true);
  });
});
