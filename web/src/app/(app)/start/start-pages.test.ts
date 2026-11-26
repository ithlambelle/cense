// Created with Claude Code (2026-11-19). Where first sign-in sends a student:
// /start, the welcome (W1, W2), Link your bank (E1) and Your next step (N3).
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WelcomeFlow } from "@/components/first-login/welcome-flow";
import { NextStepNoBank } from "@/components/first-login/next-step-no-bank";
import { ConnectView } from "@/components/safe-to-spend/connect-view";

// "server-only" refuses to load outside a server build; this test is the server.
vi.mock("server-only", () => ({}));

class Redirected extends Error {
  constructor(readonly path: string) {
    super(`redirect ${path}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Redirected(path);
  },
  useRouter: () => ({ replace: vi.fn() }),
}));

// The signed-in student's profile as /start reads it: welcomed or not, no
// profile, a failed read, or nobody signed in.
type Profile = { welcomed_at: string | null } | null | "read fails" | "signed out";
let profile: Profile = null;
const reads = vi.fn();
vi.mock("@/lib/api/auth", () => ({
  authenticatedStudent: async () => {
    if (profile === "signed out") return null;
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => {
        reads();
        return profile === "read fails"
          ? { data: null, error: { code: "42703", message: "column does not exist" } }
          : { data: profile, error: null };
      },
    };
    return { studentId: "student-1", email: null, supabase: { from: () => query } };
  },
}));

let snapshot: { applications: unknown[]; quiz: { kind: string } } = { applications: [], quiz: { kind: "quiz_unfinished" } };
const loadStudentSnapshot = vi.fn(async () => snapshot);
vi.mock("@/lib/student-data", () => ({ loadStudentSnapshot: () => loadStudentSnapshot() }));

let plaidOn = true;
vi.mock("@/lib/plaid/config", () => ({ plaidConfig: () => (plaidOn ? { environment: "sandbox" } : null) }));
let bank: { answered: boolean } | null = null;
vi.mock("@/lib/plaid/store", () => ({ loadSafeToSpend: async () => ({ ok: true, value: bank }) }));

import StartPage from "./page";
import StartLinkBankPage from "./link-bank/page";
import StartNextStepPage from "./next-step/page";
import StartWelcomePage from "./welcome/page";

const PAGES: Record<string, () => Promise<unknown>> = {
  "/start": StartPage,
  "/start/welcome": StartWelcomePage,
  "/start/link-bank": StartLinkBankPage,
  "/start/next-step": StartNextStepPage,
};

// Opens a page and follows its redirects, as the browser would, until a
// screen renders or the student leaves /start. Returns every address visited.
async function visit(path: string): Promise<{ trail: string[]; screen: ReactElement | null }> {
  const trail = [path];
  for (;;) {
    const page = PAGES[trail.at(-1)!];
    if (!page) return { trail, screen: null };
    try {
      const element = await page();
      if (!isValidElement(element)) throw new Error("expected a screen");
      return { trail, screen: element };
    } catch (error) {
      if (!(error instanceof Redirected)) throw error;
      if (trail.includes(error.path)) throw new Error(`redirect loop: ${[...trail, error.path].join(" -> ")}`);
      trail.push(error.path);
    }
  }
}

const NEW: Profile = { welcomed_at: null };
const WELCOMED: Profile = { welcomed_at: "2026-11-19T15:00:00.000Z" };

beforeEach(() => {
  profile = NEW;
  snapshot = { applications: [], quiz: { kind: "quiz_unfinished" } };
  plaidOn = true;
  bank = null;
  reads.mockClear();
  loadStudentSnapshot.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/start", () => {
  it("sends a new student to the welcome, before anything else is read", async () => {
    const { trail, screen } = await visit("/start");
    expect(trail).toEqual(["/start", "/start/welcome"]);
    expect(screen?.type).toBe(WelcomeFlow);
    expect(loadStudentSnapshot).not.toHaveBeenCalled();
  });

  it("sends a returning student where it always did: Home, or the result of a finished quiz", async () => {
    profile = WELCOMED;
    expect((await visit("/start")).trail).toEqual(["/start", "/home"]);
    snapshot = { applications: [], quiz: { kind: "match" } };
    expect((await visit("/start")).trail).toEqual(["/start", "/results"]);
    snapshot = { applications: [{ id: "a" }], quiz: { kind: "match" } };
    expect((await visit("/start")).trail).toEqual(["/start", "/home"]);
  });

  it("never stops a sign-in on the flag: a failed read or no profile goes to the usual screen", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    profile = "read fails";
    expect((await visit("/start")).trail).toEqual(["/start", "/home"]);
    profile = null;
    expect((await visit("/start")).trail).toEqual(["/start", "/home"]);
  });

  it("sends a signed-out visitor to sign in", async () => {
    profile = "signed out";
    expect((await visit("/start")).trail).toEqual(["/start", "/sign-in"]);
  });

  it("can never loop between /start and the welcome, whatever the profile says", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const state of [NEW, WELCOMED, null, "read fails"] as Profile[]) {
      profile = state;
      for (const path of Object.keys(PAGES)) {
        const { trail } = await visit(path);
        expect(trail.length, `${String(JSON.stringify(state))} from ${path}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("/start/welcome (W1, W2)", () => {
  it("shows the welcome to a new student, with Let's go leading to Link your bank", async () => {
    const { screen } = await visit("/start/welcome");
    expect(screen?.type).toBe(WelcomeFlow);
    expect(screen?.props).toEqual({ next: "/start/link-bank" });
  });

  it("leads Let's go straight to Your next step where safe to spend is off", async () => {
    plaidOn = false;
    expect((await visit("/start/welcome")).screen?.props).toEqual({ next: "/start/next-step" });
  });

  it("is first sign-in only: once welcomed, Back or a typed address goes to the usual screen", async () => {
    profile = WELCOMED;
    expect((await visit("/start/welcome")).trail).toEqual(["/start/welcome", "/start", "/home"]);
  });
});

describe("/start/link-bank (E1)", () => {
  it("is the Link your bank screen in its first sign-in form", async () => {
    profile = WELCOMED;
    const { screen } = await visit("/start/link-bank");
    expect(screen?.type).toBe(ConnectView);
    expect(screen?.props).toEqual({ firstLogin: true, sandbox: true });
  });

  it("goes on to Your next step where safe to spend is off, so there is never a dead end", async () => {
    plaidOn = false;
    const { trail, screen } = await visit("/start/link-bank");
    expect(trail).toEqual(["/start/link-bank", "/start/next-step"]);
    expect(screen?.type).toBe(NextStepNoBank);
  });

  it("sends a student who already linked a bank where linking leads: the questions, or Your money", async () => {
    bank = { answered: false };
    expect((await visit("/start/link-bank")).trail).toEqual(["/start/link-bank", "/safe-to-spend/setup"]);
    bank = { answered: true };
    expect((await visit("/start/link-bank")).trail).toEqual(["/start/link-bank", "/safe-to-spend"]);
  });
});

describe("/start/next-step (N3)", () => {
  it("has a back arrow to Link your bank, or Home and no link-later line where safe to spend is off", async () => {
    expect((await visit("/start/next-step")).screen?.props).toEqual({ backHref: "/start/link-bank", backLabel: "Link your bank", canLinkLater: true });
    plaidOn = false;
    expect((await visit("/start/next-step")).screen?.props).toEqual({ backHref: "/home", backLabel: "Home", canLinkLater: false });
  });
});
