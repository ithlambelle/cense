import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Reminder } from "@/lib/api/reminders";
import type { OneReminder } from "@/lib/reminders/in-app-data";

const REDIRECT = new Error("redirected");
const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/session", () => ({ requireStudent: async () => ({ studentId: "s", email: null, supabase: {} }) }));
const data = vi.hoisted(() => ({ loadOneReminder: vi.fn() }));
vi.mock("@/lib/reminders/in-app-data", () => data);

import FollowUpPage from "./page";

const ID = "00000000-0000-4000-8000-0000000000a1";
// A follow-up for a statement that closed Fri Nov 6, due Dec 6.
const followUp = (over: Partial<Reminder> = {}): Reminder => ({
  id: ID, applicationId: "00000000-0000-4000-8000-000000000001", kind: "statement_closing", occurrence: "2026-11-06",
  remindOn: "2026-11-03", dueAt: "2026-11-03T14:00:00.000Z", sentAt: "2026-11-03T14:00:00.000Z", actedAt: null,
  readAt: null, snoozedUntil: null, dismissedAt: null, followUpAt: "2026-11-08T14:00:00.000Z",
  createdAt: "2026-11-01T15:00:00.000Z", ...over,
});
const found = (reminder: Reminder): OneReminder => ({
  reminder, card: { cardName: "Discover it", creditLimitCents: 50_000, paymentDueDay: 6, autopayStatus: "off" }, timeZone: "America/New_York",
});

async function open(reminder: Reminder): Promise<"redirected" | "shown"> {
  data.loadOneReminder.mockResolvedValue(found(reminder));
  try {
    const element = await FollowUpPage({ params: Promise.resolve({ id: ID }) } as Parameters<typeof FollowUpPage>[0]);
    return isValidElement(element) ? "shown" : "redirected";
  } catch (error) {
    if (error === REDIRECT) return "redirected";
    throw error;
  }
}

beforeEach(() => {
  navigation.redirect.mockImplementation(() => { throw REDIRECT; });
  vi.useFakeTimers({ toFake: ["Date"] });
  // Sunday Nov 8 2026, 18:00 in New York.
  vi.setSystemTime(new Date("2026-11-08T23:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  navigation.redirect.mockReset();
});

describe("FollowUpPage", () => {
  it("shows an open follow-up", async () => {
    expect(await open(followUp())).toBe("shown");
  });

  it("goes back to Updates once the follow-up is snoozed, past its due date, paid or dismissed", async () => {
    expect(await open(followUp({ snoozedUntil: "2026-11-10T14:00:00.000Z" }))).toBe("redirected");
    expect(await open(followUp({ actedAt: "2026-11-08T20:00:00.000Z" }))).toBe("redirected");
    expect(await open(followUp({ dismissedAt: "2026-11-08T20:00:00.000Z" }))).toBe("redirected");
    vi.setSystemTime(new Date("2026-12-07T15:00:00Z"));
    expect(await open(followUp())).toBe("redirected");
    expect(navigation.redirect).toHaveBeenCalledWith("/updates");
  });

  it("goes back to Updates for a reminder that is not a follow-up", async () => {
    expect(await open(followUp({ followUpAt: null }))).toBe("redirected");
    expect(await open(followUp({ kind: "payment_due" }))).toBe("redirected");
  });
});
