import { afterEach, describe, expect, it, vi } from "vitest";

import { OFFLINE_MESSAGE } from "./client";
import {
  loadReminders,
  reapplyReminderFor,
  REMINDER_ALREADY_SENT,
  REMINDER_NOT_FOUND,
  saveReapplyReminder,
  type Reminder,
} from "./reminders";

const ID = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    applicationId: ID,
    kind: "reapply",
    occurrence: "2027-04-17",
    remindOn: "2027-04-17",
    dueAt: "2027-04-17T13:00:00Z",
    sentAt: null,
    actedAt: null,
    createdAt: "2026-10-17T13:00:00Z",
    ...overrides,
  };
}

function answer(status: number, body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const apiError = (code: string, message: string) => ({ error: { code, message } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveReapplyReminder", () => {
  it("posts the card and day, and returns the saved reminder", async () => {
    const fetchFn = answer(201, reminder());
    expect(await saveReapplyReminder(ID, "2027-04-17")).toEqual({ kind: "ok", reminder: reminder() });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/reminders");
    expect(fetchFn.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ applicationId: ID, remindOn: "2027-04-17" });
  });

  it("shows the API's message for a day it refuses (400 invalid_reminder)", async () => {
    answer(400, apiError("invalid_reminder", "Pick a day from tomorrow to a year from now, for a denied application."));
    expect(await saveReapplyReminder(ID, "2027-04-17")).toEqual({
      kind: "failed",
      message: "Pick a day from tomorrow to a year from now, for a denied application.",
    });
  });

  it("says the card was not found (404) and that a sent reminder cannot change (409)", async () => {
    answer(404, apiError("not_found", "Application not found."));
    expect(await saveReapplyReminder(ID, "2027-04-17")).toEqual({ kind: "failed", message: REMINDER_NOT_FOUND });
    answer(409, apiError("already_sent", "That reminder was already sent."));
    expect(await saveReapplyReminder(ID, "2027-04-17")).toEqual({ kind: "failed", message: REMINDER_ALREADY_SENT });
  });

  it("says signed-out on 401, and asks to try again when offline or the data is briefly down (503)", async () => {
    answer(401, apiError("unauthorized", "Sign in to continue."));
    expect(await saveReapplyReminder(ID, "2027-04-17")).toEqual({ kind: "signed-out" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await saveReapplyReminder(ID, "2027-04-17")).toEqual({ kind: "failed", message: OFFLINE_MESSAGE });
    answer(503, apiError("data_unavailable", "Your data is temporarily unavailable. Please try again."));
    expect(await saveReapplyReminder(ID, "2027-04-17")).toEqual({
      kind: "failed",
      message: "Your data is temporarily unavailable. Please try again.",
    });
  });
});

describe("loadReminders", () => {
  it("returns the student's reminders, or signed-out on 401", async () => {
    answer(200, { reminders: [reminder()] });
    expect(await loadReminders()).toEqual({ kind: "ok", reminders: [reminder()] });
    answer(401, apiError("unauthorized", "Sign in to continue."));
    expect(await loadReminders()).toEqual({ kind: "signed-out" });
  });
});

describe("reapplyReminderFor", () => {
  it("finds this card's reapply reminder, preferring the unsent one, then the newest", () => {
    const sent = reminder({ id: "00000000-0000-4000-8000-0000000000a1", remindOn: "2027-01-01", sentAt: "2027-01-01T13:00:00Z", createdAt: "2026-12-01T00:00:00Z" });
    const unsent = reminder({ id: "00000000-0000-4000-8000-0000000000a2", remindOn: "2027-05-01", createdAt: "2026-11-01T00:00:00Z" });
    const otherCard = reminder({ applicationId: OTHER, createdAt: "2027-02-01T00:00:00Z" });
    const autopay = reminder({ kind: "check_autopay", createdAt: "2027-03-01T00:00:00Z" });
    expect(reapplyReminderFor([sent, unsent, otherCard, autopay], ID)).toBe(unsent);
    expect(reapplyReminderFor([sent, otherCard], ID)).toBe(sent);
    expect(reapplyReminderFor([otherCard, autopay], ID)).toBeNull();
  });
});
