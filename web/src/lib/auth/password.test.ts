import { describe, expect, it } from "vitest";

import { passwordCredentialsSchema } from "@/lib/api/password";

import { looksLikeEmail, passwordFeedback, passwordProblem } from "./password";

describe("password checks", () => {
  it("asks for length only, with no rule about numbers or symbols", () => {
    expect(passwordProblem("short1")).toBe("Use at least 8 characters.");
    expect(passwordProblem("correcthorse")).toBeNull();
    expect(passwordProblem("x".repeat(72))).toBeNull();
    expect(passwordProblem("x".repeat(73))).toBe("Use 72 characters or fewer.");
    // The limit is really 72 bytes: 37 accented letters fit 72 characters but
    // not 72 bytes, so the message does not count characters.
    expect(passwordProblem("é".repeat(36))).toBeNull();
    expect(passwordProblem("é".repeat(37))).toBe("That password is too long.");
    expect(passwordProblem("🔑".repeat(19))).toBe("That password is too long.");
  });

  it("is the API's rule too, value for value, with the same words", () => {
    for (const password of ["", "short1", "1234567", "12345678", "x".repeat(72), "x".repeat(73), "é".repeat(36), "é".repeat(37), "🔑".repeat(18), "🔑".repeat(19)]) {
      const api = passwordCredentialsSchema.safeParse({ email: "alex@email.com", password });
      const problem = passwordProblem(password);
      expect(api.success, password).toBe(problem === null);
      if (problem) expect(api.error?.issues.map((issue) => issue.message), password).toContain(problem);
    }
  });

  it("says nothing before the student types, hints while they type, and errs only once they tried to submit", () => {
    expect(passwordFeedback("", false)).toEqual({});
    expect(passwordFeedback("abc", false)).toEqual({ hint: "Use at least 8 characters." });
    expect(passwordFeedback("x".repeat(8), false)).toEqual({});
    expect(passwordFeedback("x".repeat(73), false)).toEqual({ hint: "Use 72 characters or fewer." });
    expect(passwordFeedback("", true)).toEqual({ error: "Use at least 8 characters." });
    expect(passwordFeedback("abc", true)).toEqual({ error: "Use at least 8 characters." });
    expect(passwordFeedback("x".repeat(8), true)).toEqual({});
  });

  it("catches an email that is clearly unfinished", () => {
    expect(looksLikeEmail("alex@")).toBe(false);
    expect(looksLikeEmail("alex@email.com")).toBe(true);
  });
});
