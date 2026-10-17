import { describe, expect, it } from "vitest";

import { allowedNext, deniedPath, googleSignInPath, planPath, signInPath, waitingPath } from "./routes";

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

describe("tracked card paths", () => {
  const ID = "00000000-0000-4000-8000-000000000001";

  it("keeps the card with the student through the rejection guide", () => {
    expect(deniedPath("options", ID)).toBe(`/denied?application=${ID}`);
    expect(deniedPath("reminderSaved", ID)).toBe(`/denied/reminder/saved?application=${ID}`);
    expect(deniedPath("secondLook", null)).toBe("/denied/second-look");
  });

  it("builds the plan and waiting screens for one card, both allowed after sign-in", () => {
    expect(planPath(ID)).toBe(`/plan?application=${ID}`);
    expect(waitingPath(ID)).toBe(`/applications/${ID}/waiting`);
    expect(allowedNext(waitingPath(ID))).toBe(waitingPath(ID));
  });
});
