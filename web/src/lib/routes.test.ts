import { describe, expect, it } from "vitest";

import {
  allowedNext,
  applicationBackLink,
  applicationPath,
  autopayConfirmPath,
  autopayOnPath,
  autopayStepsPath,
  cardBackLink,
  cardSetupPath,
  cardPath,
  deniedPath,
  googleSignInPath,
  learnTopicPath,
  paymentRemindersPath,
  pennyPath,
  planPath,
  quizBackHref,
  quizPath,
  remindersBackLink,
  spendLimitBackLink,
  spendLimitCreditPath,
  spendLimitOrigin,
  spendLimitPath,
  spendLimitPickPath,
  spendLimitSuggestionPath,
  safeToSpendSetupPath,
  signInPath,
  waitingPath,
} from "./routes";

describe("allowedNext", () => {
  it.each([
    "/quiz",
    "/results",
    "/home",
    "/cards/discover-cash-back",
    "/safe-to-spend",
    "/safe-to-spend/connect",
    "/safe-to-spend/setup",
    "/settings",
    "/settings/reminders",
    "/home?reminder=statement_closing",
    "/home?reminder=reapply",
    "/learn",
    "/learn/penny",
    "/learn/student-loans",
  ])("keeps %s", (path) => {
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
    "/safe-to-spend/setup?step=2",
    "/safe-to-spend/other",
    "/settings/x",
    "/home?reminder=other",
    "/home?reminder=payment_due&x=1",
    "/learn/penny?answer=credit-score",
    "/learn/Credit",
    "/learn/a/b",
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

describe("safeToSpendSetupPath", () => {
  it("leaves the first step bare and numbers the rest", () => {
    expect(safeToSpendSetupPath()).toBe("/safe-to-spend/setup");
    expect(safeToSpendSetupPath(1)).toBe("/safe-to-spend/setup");
    expect(safeToSpendSetupPath(6)).toBe("/safe-to-spend/setup?step=6");
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

  it("builds the payment reminders screen for one card, allowed after sign-in", () => {
    expect(paymentRemindersPath(ID)).toBe(`/applications/${ID}/reminders`);
    expect(paymentRemindersPath(ID, "card")).toBe(`/applications/${ID}/reminders?from=card`);
    expect(paymentRemindersPath(ID, "card", "home")).toBe(`/applications/${ID}/reminders?from=card&card_from=home`);
  });

  it("sends the reminder screen's Back to the card page as it was opened, or Home", () => {
    const card = "discover-it-student-cash-back";
    expect(remindersBackLink("card", "home", card)).toEqual({ href: `/cards/${card}?from=home`, label: "Card details" });
    expect(remindersBackLink("card", undefined, card)).toEqual({ href: `/cards/${card}`, label: "Card details" });
    expect(remindersBackLink("card", "https://evil.example", card)).toEqual({ href: `/cards/${card}`, label: "Card details" });
    expect(remindersBackLink("card", "home", null)).toEqual({ href: "/home", label: "Home" });
    expect(remindersBackLink(undefined, "home", card)).toEqual({ href: "/home", label: "Home" });
    expect(allowedNext(paymentRemindersPath(ID))).toBe(paymentRemindersPath(ID));
    expect(allowedNext(`/applications/${ID}/reminders/x`)).toBeNull();
  });

  it("builds card setup's screens (US-10), each allowed after sign-in, and the reminder screen's Back to setup", () => {
    expect(cardSetupPath(ID)).toBe(`/applications/${ID}/setup`);
    expect(autopayStepsPath(ID)).toBe(`/applications/${ID}/setup/autopay`);
    expect(autopayConfirmPath(ID)).toBe(`/applications/${ID}/setup/autopay/confirm`);
    expect(autopayOnPath(ID)).toBe(`/applications/${ID}/setup/autopay/on`);
    for (const path of [cardSetupPath(ID), autopayStepsPath(ID), autopayConfirmPath(ID), autopayOnPath(ID)]) {
      expect(allowedNext(path)).toBe(path);
    }
    expect(allowedNext(`/applications/${ID}/setup/x`)).toBeNull();
    expect(paymentRemindersPath(ID, "setup")).toBe(`/applications/${ID}/reminders?from=setup`);
    expect(remindersBackLink("setup", undefined, null, ID)).toEqual({ href: `/applications/${ID}/setup`, label: "Card setup" });
    expect(remindersBackLink("setup", undefined, null)).toEqual({ href: "/home", label: "Home" });
  });

  it("opens the spend limit at S2 with a credit limit, S1 without, and returns where it started (US-04)", () => {
    const base = `/applications/${ID}/setup/spend-limit`;
    expect(spendLimitPath(ID, 50000)).toBe(`${base}/suggestion`);
    expect(spendLimitPath(ID, null, "home")).toBe(`${base}?from=home`);
    expect(spendLimitPath(ID, 0)).toBe(base);
    expect(spendLimitPickPath(ID, "home")).toBe(`${base}/pick?from=home`);
    expect(spendLimitPickPath(ID, "setup")).toBe(`${base}/pick`);
    for (const path of [spendLimitCreditPath(ID), spendLimitSuggestionPath(ID), spendLimitPickPath(ID)]) {
      expect(allowedNext(path)).toBe(path);
    }
    expect(spendLimitOrigin("home")).toBe("home");
    expect(spendLimitOrigin(["home"])).toBe("setup");
    expect(spendLimitOrigin("https://evil.example")).toBe("setup");
    expect(spendLimitBackLink(ID, "home")).toEqual({ href: "/home", label: "Home" });
    expect(spendLimitBackLink(ID, "setup")).toEqual({ href: `/applications/${ID}/setup`, label: "Card setup" });
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

describe("the quiz and the waiting screen go back where they were opened from", () => {
  it("opens the quiz with its origin, and its first question goes back there", () => {
    expect(quizPath()).toBe("/quiz");
    expect(quizPath("cards")).toBe("/quiz?from=cards");
    expect(quizPath("results")).toBe("/quiz?from=results");
    expect(quizBackHref("cards")).toBe("/cards");
    expect(quizBackHref("results")).toBe("/results");
    expect(quizPath("account")).toBe("/quiz?from=account");
    expect(quizBackHref("account")).toBe("/settings");
    for (const other of [undefined, "home", "https://evil.example", ["cards", "cards"]]) expect(quizBackHref(other)).toBe("/home");
  });

  it("passes Mark result's origin to the waiting screen", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(waitingPath(id)).toBe(`/applications/${id}/waiting`);
    expect(waitingPath(id, "card")).toBe(`/applications/${id}/waiting?from=card`);
  });
});

describe("Learn and Ask Penny paths", () => {
  it("builds a topic page and Ask Penny with an answer and where it came from", () => {
    expect(learnTopicPath("student-loans")).toBe("/learn/student-loans");
    expect(pennyPath()).toBe("/learn/penny");
    expect(pennyPath("credit-score", "learn")).toBe("/learn/penny?answer=credit-score&from=learn");
    expect(pennyPath("credit-score")).toBe("/learn/penny?answer=credit-score");
  });
});
