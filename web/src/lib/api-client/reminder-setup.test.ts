import { afterEach, describe, expect, it, vi } from "vitest";

import { parseDay, saveReminderSetup } from "./reminder-setup";

const ID = "00000000-0000-4000-8000-000000000001";
const ON = { paymentDue: true, statementClosing: true };
const DAYS = { statementClosingDay: 14, paymentDueDay: 9 };

type Reply = { status: number; body?: unknown };

// Answers each request in turn and records what was sent.
function server(...replies: Reply[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift() ?? { status: 500, body: {} };
    return reply.status === 204 ? new Response(null, { status: 204 }) : Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const calls = (fetchFn: ReturnType<typeof server>) =>
  fetchFn.mock.calls.map(([url, init]) => ({
    method: init?.method,
    url,
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  }));

const ok = { status: 200, body: {} };
const failure = (status: number, code: string, message: string) => ({ status, body: { error: { code, message } } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseDay", () => {
  it.each([["1", 1], ["9", 9], [" 14 ", 14], ["31", 31], ["09", 9]])("reads %j as day %d", (value, day) => {
    expect(parseDay(value)).toBe(day);
  });

  it.each(["", "0", "32", "100", "-1", "1.5", "14th", "ten", "1e1"])("refuses %j", (value) => {
    expect(parseDay(value)).toBeNull();
  });
});

describe("saveReminderSetup", () => {
  it("saves the days, then the changed choices, then lights the star, in that order", async () => {
    const fetchFn = server(ok, ok, { status: 200, body: {} });
    const result = await saveReminderSetup({
      applicationId: ID,
      days: DAYS,
      choices: { paymentDue: true, statementClosing: false },
      savedChoices: ON,
    });
    expect(result).toEqual({ kind: "ok" });
    expect(calls(fetchFn)).toEqual([
      { method: "PATCH", url: `/api/v1/applications/${ID}`, body: DAYS },
      // Only the toggle that changed, and never check autopay.
      { method: "PATCH", url: "/api/v1/me/reminder-settings", body: { statementClosing: false } },
      { method: "PUT", url: `/api/v1/applications/${ID}/plans/first_month/steps/payment_reminder`, body: undefined },
    ]);
  });

  it("skips the settings request when no toggle changed", async () => {
    const fetchFn = server(ok, ok);
    expect(await saveReminderSetup({ applicationId: ID, days: DAYS, choices: ON, savedChoices: ON })).toEqual({ kind: "ok" });
    expect(calls(fetchFn).map((call) => call.method)).toEqual(["PATCH", "PUT"]);
  });

  it("passes the API's reason for a card that is not approved and sends nothing else", async () => {
    const fetchFn = server(failure(400, "invalid_request", "Closing and due days are for an approved card."));
    expect(await saveReminderSetup({ applicationId: ID, days: DAYS, choices: ON, savedChoices: ON })).toEqual({
      kind: "failed",
      stage: "days",
      message: "Closing and due days are for an approved card.",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("says the dates saved but the choices did not, and never lights the star", async () => {
    const fetchFn = server(ok, failure(503, "data_unavailable", "Your data is temporarily unavailable. Please try again."));
    const result = await saveReminderSetup({
      applicationId: ID,
      days: DAYS,
      choices: { paymentDue: false, statementClosing: true },
      savedChoices: ON,
    });
    expect(result).toEqual({
      kind: "failed",
      stage: "choices",
      message: "Your dates are saved, but your reminder choices are not. Your data is temporarily unavailable. Please try again.",
    });
    expect(calls(fetchFn).map((call) => call.method)).toEqual(["PATCH", "PATCH"]);
  });

  it("says the reminders saved when only the star fails", async () => {
    server(ok, { status: 500, body: "not json" });
    expect(await saveReminderSetup({ applicationId: ID, days: DAYS, choices: ON, savedChoices: ON })).toEqual({
      kind: "failed",
      stage: "star",
      message: "Your reminders are saved, but Home did not mark this step done. Something went wrong on our side. Please try again.",
    });
  });

  it.each([0, 1, 2])("says signed-out when request %d answers 401", async (index) => {
    const replies: Reply[] = [ok, ok, ok];
    replies[index] = failure(401, "unauthorized", "Sign in to continue.");
    server(...replies);
    const result = await saveReminderSetup({
      applicationId: ID,
      days: DAYS,
      choices: { paymentDue: false, statementClosing: true },
      savedChoices: ON,
    });
    expect(result).toEqual({ kind: "signed-out" });
  });
});
