// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OFFLINE_MESSAGE } from "@/lib/api-client/client";
import { REMINDER_ALREADY_SENT, REMINDER_NOT_FOUND } from "@/lib/api-client/reminders";

import { ReminderSetup } from "./reminder-setup";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/denied/reminder", useRouter: () => ({ push, replace, refresh: vi.fn() }) }));

const ID = "00000000-0000-4000-8000-000000000001";

// Each request takes the next reply; "offline" is a request that never gets an answer.
function server(...replies: ({ status: number; body: unknown } | "offline")[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    if (reply === "offline") throw new TypeError("Failed to fetch");
    return Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const apiError = (status: number, code: string, message: string) => ({ status, body: { error: { code, message } } });
const created = (remindOn: string) => ({
  status: 201,
  body: {
    id: "00000000-0000-4000-8000-0000000000aa",
    applicationId: ID,
    kind: "reapply",
    occurrence: remindOn,
    remindOn,
    dueAt: `${remindOn}T13:00:00Z`,
    sentAt: null,
    actedAt: null,
    createdAt: "2026-10-17T13:00:00Z",
  },
});
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save reapply reminder" }));

beforeEach(() => {
  // Only the clock is faked, so requests and waitFor still run on real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T09:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  push.mockClear();
  replace.mockClear();
});

function chooseDate(value: string) {
  fireEvent.click(screen.getByRole("button", { name: /Choose another date/ }));
  fireEvent.change(screen.getByLabelText("Reminder date"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Save reapply reminder" }));
}

describe("ReminderSetup", () => {
  it("offers a date about 6 months from today on the student's calendar", () => {
    server();
    render(<ReminderSetup applicationId={ID} />);
    expect(screen.getByText("April 17, 2027")).toBeTruthy();
  });

  it("links the before-you-reapply card to this card's plan", () => {
    server();
    render(<ReminderSetup applicationId={ID} />);
    expect(screen.getByRole("link", { name: "See the 5-step plan" }).getAttribute("href")).toBe(`/denied/plan?application=${ID}`);
  });

  it("refuses today, and saves nothing", () => {
    const fetchFn = server();
    render(<ReminderSetup applicationId={ID} />);
    chooseDate("2026-10-17");
    expect(screen.getByRole("alert").textContent).toContain("Pick a date after today.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a typed date past the one-year limit the date picker suggests", () => {
    const fetchFn = server();
    render(<ReminderSetup applicationId={ID} />);
    chooseDate("2027-10-18");
    expect(screen.getByRole("alert").textContent).toContain("Pick a date no later than October 17, 2027.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("accepts the last allowed day and opens the saved check for this card", async () => {
    const fetchFn = server(created("2027-10-17"));
    render(<ReminderSetup applicationId={ID} />);
    chooseDate("2027-10-17");
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/denied/reminder/saved?application=${ID}`));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/v1/reminders");
    expect(fetchFn.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ applicationId: ID, remindOn: "2027-10-17" });
  });

  it("saves the 6-month date by default", async () => {
    const fetchFn = server(created("2027-04-17"));
    render(<ReminderSetup applicationId={ID} />);
    save();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/denied/reminder/saved?application=${ID}`));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ applicationId: ID, remindOn: "2027-04-17" });
  });

  it.each([
    [
      "the API's message for a day it refuses (400)",
      apiError(400, "invalid_reminder", "Pick a day from tomorrow to a year from now, for a denied application."),
      "Pick a day from tomorrow to a year from now, for a denied application.",
    ],
    ["that the card was not found (404)", apiError(404, "not_found", "Application not found."), REMINDER_NOT_FOUND],
    ["that a sent reminder cannot change (409)", apiError(409, "already_sent", "That reminder was already sent."), REMINDER_ALREADY_SENT],
  ])("says %s and stays on this screen", async (_, reply, message) => {
    server(reply);
    render(<ReminderSetup applicationId={ID} />);
    save();
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks to try again when offline or the data is briefly down (503), and saving again works", async () => {
    server(
      "offline",
      apiError(503, "data_unavailable", "Your data is temporarily unavailable. Please try again."),
      created("2027-04-17"),
    );
    render(<ReminderSetup applicationId={ID} />);
    save();
    expect((await screen.findByRole("alert")).textContent).toContain(OFFLINE_MESSAGE);
    save();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Your data is temporarily unavailable. Please try again."),
    );
    save();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/denied/reminder/saved?application=${ID}`));
  });

  it("sends a student whose session ended to sign in", async () => {
    server(apiError(401, "unauthorized", "Sign in to continue."));
    render(<ReminderSetup applicationId={ID} />);
    save();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
    expect(push).not.toHaveBeenCalled();
  });

  it("asks to start from Home when no card is given", () => {
    render(<ReminderSetup applicationId={null} />);
    expect(screen.getByText("Open this from your card on Home to set a reminder for it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save reapply reminder" })).toBeNull();
  });
});
