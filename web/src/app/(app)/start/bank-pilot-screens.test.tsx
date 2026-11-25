// Created with Claude Code (2026-11-25). The screens that offer Link, with
// real banks for the pilot (PLAID_ENV production): a student who cannot link
// (not in the pilot, or no room left) is never invited and never shown the
// consent screen, and the sandbox stays as it was. Each page is called as the
// server would call it; lib/plaid/offer.ts and lib/plaid/pilot.ts run for
// real against the mocked database answer.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
  notFound: () => {
    throw new NotFound();
  },
}));

const rpc = vi.fn();
const student = { supabase: { rpc }, studentId: "student-1", email: "ana@bu.edu" };
vi.mock("@/lib/session", () => ({ requireStudent: vi.fn(async () => student) }));
vi.mock("@/lib/first-login", () => ({ needsWelcome: vi.fn(async () => true) }));

const config = vi.hoisted(() => ({ plaidConfig: vi.fn() }));
vi.mock("@/lib/plaid/config", () => config);
const store = vi.hoisted(() => ({ loadSafeToSpend: vi.fn() }));
vi.mock("@/lib/plaid/store", () => store);
const data = vi.hoisted(() => ({
  loadStudentSnapshot: vi.fn(),
  loadApplicationDetail: vi.fn(),
  loadReminderSettings: vi.fn(),
  loadComingUpCards: vi.fn(),
}));
vi.mock("@/lib/student-data", () => data);

import HomePage from "@/app/(app)/home/page";
import SafeToSpendConnectPage from "@/app/(app)/safe-to-spend/connect/page";
import StartLinkBankPage from "@/app/(app)/start/link-bank/page";
import StartNextStepPage from "@/app/(app)/start/next-step/page";
import StartWelcomePage from "@/app/(app)/start/welcome/page";

const SANDBOX = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32), environment: "sandbox" as const };
const PRODUCTION = { ...SANDBOX, baseUrl: "https://production.plaid.com", environment: "production" as const };
const LINKED = { institutionName: "Chase", answered: true, bills: [], days: 30, status: "active" };

const access = (value: string) =>
  rpc.mockImplementation(async (name: string) =>
    name === "plaid_pilot_access" ? { data: value, error: null } : { data: null, error: { message: `unexpected ${name}` } },
  );

async function outcome(page: () => Promise<unknown>): Promise<{ redirect?: string; notFound?: true; props?: Record<string, unknown> }> {
  try {
    const element = await page();
    if (!isValidElement(element)) throw new Error("not an element");
    return { props: (element as ReactElement<Record<string, unknown>>).props };
  } catch (error) {
    if (error instanceof Redirect) return { redirect: error.to };
    if (error instanceof NotFound) return { notFound: true };
    throw error;
  }
}

beforeEach(() => {
  config.plaidConfig.mockReturnValue(PRODUCTION);
  store.loadSafeToSpend.mockResolvedValue({ ok: true, value: null });
  data.loadStudentSnapshot.mockResolvedValue({ applications: [], quiz: { kind: "none" }, quizAnswered: false });
  data.loadComingUpCards.mockResolvedValue(null);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rpc.mockReset();
});

describe("first sign-in with real banks", () => {
  it("sends a student outside the pilot from the welcome to Your next step, never Link your bank", async () => {
    access("none");
    expect((await outcome(StartWelcomePage)).props?.next).toBe("/start/next-step");
  });

  it("sends a pilot student with room to Link your bank", async () => {
    access("open");
    expect((await outcome(StartWelcomePage)).props?.next).toBe("/start/link-bank");
  });

  it("does not show Link your bank to a pilot student with no room left", async () => {
    access("full");
    expect((await outcome(StartWelcomePage)).props?.next).toBe("/start/next-step");
    expect(await outcome(StartLinkBankPage)).toEqual({ redirect: "/start/next-step" });
  });

  it("shows the consent screen without the sandbox note to a pilot student with room", async () => {
    access("open");
    expect((await outcome(StartLinkBankPage)).props).toEqual({ firstLogin: true, sandbox: false });
  });

  it("sends a student who already linked a bank on, whatever the pilot says", async () => {
    access("none");
    store.loadSafeToSpend.mockResolvedValue({ ok: true, value: LINKED });
    expect(await outcome(StartLinkBankPage)).toEqual({ redirect: "/safe-to-spend" });
  });

  it("says nothing about linking later on Your next step to a student who cannot link", async () => {
    access("none");
    expect((await outcome(StartNextStepPage)).props).toMatchObject({ canLinkLater: false, backHref: "/home" });
    access("open");
    expect((await outcome(StartNextStepPage)).props).toMatchObject({ canLinkLater: true, backHref: "/start/link-bank" });
  });
});

describe("Connect with real banks", () => {
  it("sends a student outside the pilot Home instead of showing the consent screen", async () => {
    access("none");
    expect(await outcome(SafeToSpendConnectPage)).toEqual({ redirect: "/home" });
  });

  it("sends a pilot student with no room left Home too", async () => {
    access("full");
    expect(await outcome(SafeToSpendConnectPage)).toEqual({ redirect: "/home" });
  });

  it("shows a pilot student with room the screen without the sandbox note", async () => {
    access("open");
    expect((await outcome(SafeToSpendConnectPage)).props).toEqual({ sandbox: false });
  });

  it("is not found when safe to spend is off, as before", async () => {
    config.plaidConfig.mockReturnValue(null);
    expect(await outcome(SafeToSpendConnectPage)).toEqual({ notFound: true });
  });

  it("fails loudly rather than guess when the pilot cannot be read", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
    await expect(SafeToSpendConnectPage()).rejects.toThrow("pilot");
  });
});

describe("Home's safe to spend card", () => {
  const home = () => HomePage({ searchParams: Promise.resolve({}) } as never);

  it("leaves the invitation out for a student outside the pilot", async () => {
    access("none");
    expect((await outcome(home)).props?.safeToSpend).toBeUndefined();
  });

  it("invites a pilot student with room, in the words for real banks", async () => {
    access("open");
    expect((await outcome(home)).props).toMatchObject({ safeToSpend: null, bankSandbox: false });
  });

  it("shows a linked bank without asking the pilot at all", async () => {
    store.loadSafeToSpend.mockResolvedValue({ ok: true, value: LINKED });
    expect((await outcome(home)).props).toMatchObject({ safeToSpend: LINKED, bankSandbox: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves the card out, and still loads Home, when the pilot cannot be read", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
    expect((await outcome(home)).props?.safeToSpend).toBeUndefined();
  });
});

describe("the sandbox, unchanged", () => {
  beforeEach(() => config.plaidConfig.mockReturnValue(SANDBOX));

  it("offers Link to every student without asking the pilot, with the sandbox note", async () => {
    expect((await outcome(StartWelcomePage)).props?.next).toBe("/start/link-bank");
    expect((await outcome(StartLinkBankPage)).props).toEqual({ firstLogin: true, sandbox: true });
    expect((await outcome(SafeToSpendConnectPage)).props).toEqual({ sandbox: true });
    expect((await outcome(() => HomePage({ searchParams: Promise.resolve({}) } as never))).props).toMatchObject({ safeToSpend: null, bankSandbox: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});
