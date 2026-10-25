import { describe, expect, it } from "vitest";

import { allowedNext, applicationBackLink, applicationPath, cardBackLink, cardPath, deniedPath, googleSignInPath, planPath, signInPath, waitingPath } from "./routes";

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
    expect(deniedPath("noLetter", ID)).toBe(`/denied/no-letter?application=${ID}`);
    expect(deniedPath("secondLook", null)).toBe("/denied/second-look");
  });

  it("builds the plan and waiting screens for one card, both allowed after sign-in", () => {
    expect(planPath(ID)).toBe(`/plan?application=${ID}`);
    expect(waitingPath(ID)).toBe(`/applications/${ID}/waiting`);
    expect(allowedNext(waitingPath(ID))).toBe(waitingPath(ID));
  });
});

describe("card pages remember where they were opened from", () => {
  it("adds the origin to the card address", () => {
    expect(cardPath("discover-it-student-cash-back")).toBe("/cards/discover-it-student-cash-back");
    expect(cardPath("discover-it-student-cash-back", "results")).toBe("/cards/discover-it-student-cash-back?from=results");
    expect(cardPath("discover-it-student-cash-back", "home")).toBe("/cards/discover-it-student-cash-back?from=home");
  });

  it("sends the back arrow to that origin, and anything else to the card list", () => {
    expect(cardBackLink("results")).toEqual({ href: "/results", label: "Your match" });
    expect(cardBackLink("home")).toEqual({ href: "/home", label: "Home" });
    expect(cardBackLink(undefined)).toEqual({ href: "/cards", label: "Cards" });
    expect(cardBackLink("https://evil.example")).toEqual({ href: "/cards", label: "Cards" });
    expect(cardBackLink(["results", "home"])).toEqual({ href: "/cards", label: "Cards" });
  });
});

describe("Mark result remembers the card page it was opened from", () => {
  const ID = "00000000-0000-4000-8000-000000000001";

  it("adds the origin to the address", () => {
    expect(applicationPath(ID)).toBe(`/applications/${ID}`);
    expect(applicationPath(ID, "card")).toBe(`/applications/${ID}?from=card`);
  });

  it("goes back to the card page only from the card page, and Home otherwise", () => {
    expect(applicationBackLink("card", "chime-card")).toEqual({ href: "/cards/chime-card", label: "Card details" });
    expect(applicationBackLink("card", null)).toEqual({ href: "/home", label: "Home" });
    expect(applicationBackLink(undefined, "chime-card")).toEqual({ href: "/home", label: "Home" });
    expect(applicationBackLink("https://evil.example", "chime-card")).toEqual({ href: "/home", label: "Home" });
    expect(applicationBackLink(["card", "card"], "chime-card")).toEqual({ href: "/home", label: "Home" });
  });
});
