import { describe, expect, it } from "vitest";

import { allowedNext, googleSignInPath, signInPath } from "./routes";

describe("allowedNext", () => {
  it.each(["/quiz", "/results", "/home", "/cards/discover-cash-back"])("keeps %s", (path) => {
    expect(allowedNext(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/.//evil.example",
    "/quiz?step=2",
    "/quiz/",
    "/quiz\n",
    "/cards/../settings",
    "/cards/a/b",
    "/cards/UPPER",
    "/settings",
    "quiz",
    "",
  ])("drops %j", (path) => {
    expect(allowedNext(path)).toBeNull();
  });

  it("drops a missing value", () => {
    expect(allowedNext(null)).toBeNull();
    expect(allowedNext(undefined)).toBeNull();
  });
});

describe("sign-in paths", () => {
  it("carries an allowed next and nothing else", () => {
    expect(signInPath("/quiz")).toBe("/sign-in?next=%2Fquiz");
    expect(signInPath("//evil.example")).toBe("/sign-in");
    expect(signInPath(null)).toBe("/sign-in");
  });

  it("sends Google sign-in to the landing check unless an allowed next is given", () => {
    expect(googleSignInPath("/quiz")).toBe("/api/v1/auth/google?next=%2Fquiz");
    expect(googleSignInPath("https://evil.example")).toBe("/api/v1/auth/google?next=%2Fstart");
  });
});
