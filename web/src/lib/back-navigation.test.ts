import { describe, expect, it } from "vitest";

import { previousScreen, screenName } from "./back-navigation";

const ORIGIN = "https://censefinance.com";
const at = (...paths: string[]) => paths.map((path) => ({ url: `${ORIGIN}${path}` }));

describe("previousScreen", () => {
  it("is the Cense screen the student was on before this one", () => {
    expect(previousScreen(at("/home", "/denied/plan?application=a"), 1, ORIGIN)?.pathname).toBe("/home");
    expect(previousScreen(at("/learn", "/home", "/settings"), 2, ORIGIN)?.pathname).toBe("/home");
  });

  it("is null as the first screen in the tab: an email link, a typed address, a reload", () => {
    expect(previousScreen(at("/denied/plan"), 0, ORIGIN)).toBeNull();
    expect(previousScreen([], 0, ORIGIN)).toBeNull();
  });

  it("never returns to signing in or out, so a student who signed in goes to the parent", () => {
    for (const path of ["/sign-in?next=%2Fhome", "/sign-up", "/start", "/signed-out", "/forgot-password", "/reset-password", "/account-deleted"]) {
      expect(previousScreen(at(path, "/settings"), 1, ORIGIN), path).toBeNull();
    }
    expect(previousScreen(at("/api/v1/auth/callback", "/home"), 1, ORIGIN)).toBeNull();
  });

  it("never leaves Cense, and ignores the same address twice or an unreadable entry", () => {
    expect(previousScreen([{ url: "https://mail.example.com/inbox" }, { url: `${ORIGIN}/plan` }], 1, ORIGIN)).toBeNull();
    expect(previousScreen(at("/settings", "/settings"), 1, ORIGIN)).toBeNull();
    expect(previousScreen([{ url: null }, { url: `${ORIGIN}/plan` }], 1, ORIGIN)).toBeNull();
    expect(previousScreen([{ url: "not a url" }, { url: `${ORIGIN}/plan` }], 1, ORIGIN)).toBeNull();
  });
});

describe("screenName", () => {
  it("names the screens the arrow returns to, for screen readers", () => {
    expect(screenName(new URL(`${ORIGIN}/home?celebrate=a`))).toBe("Home");
    expect(screenName(new URL(`${ORIGIN}/settings`))).toBe("Your account");
    expect(screenName(new URL(`${ORIGIN}/denied/plan?application=a`))).toBe("Plan");
    expect(screenName(new URL(`${ORIGIN}/cards/discover-it`))).toBe("Card details");
    expect(screenName(new URL(`${ORIGIN}/learn/student-loans`))).toBe("Student loans");
    expect(screenName(new URL(`${ORIGIN}/updates`))).toBe("Updates");
    expect(screenName(new URL(`${ORIGIN}/applications/a1/setup`))).toBe("Card setup");
    expect(screenName(new URL(`${ORIGIN}/applications/a1/setup/autopay`))).toBe("Autopay steps");
    expect(screenName(new URL(`${ORIGIN}/applications/a1/setup/autopay/on`))).toBe("Autopay is on");
    expect(screenName(new URL(`${ORIGIN}/applications/a1/setup/spend-limit/suggestion?from=home`))).toBe("Your suggestion");
    expect(screenName(new URL(`${ORIGIN}/applications/a1/setup/elsewhere`))).toBeNull();
    expect(screenName(new URL(`${ORIGIN}/somewhere`))).toBeNull();
  });
});
