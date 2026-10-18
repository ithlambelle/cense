// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReminderSavedCheck } from "./reminder-saved-check";

// Lets a test make the next request throw, as a bug in this app would.
const loadBug = vi.hoisted(() => ({ throwOnce: false }));
vi.mock("@/lib/api-client/pending", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client/pending")>();
  return {
    ...actual,
    pendingRequest: ((...args: Parameters<typeof actual.pendingRequest>) => {
      if (loadBug.throwOnce) {
        loadBug.throwOnce = false;
        return Promise.reject(new Error("bug"));
      }
      return actual.pendingRequest(...args);
    }) as typeof actual.pendingRequest,
  };
});

const replace = vi.fn();
// One router for every render, as in the app (useLoaded reloads when it changes).
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/denied/reminder/saved", useRouter: () => router }));

const ID = "00000000-0000-4000-8000-000000000001";
const reminder = (applicationId: string, remindOn: string, createdAt: string) => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  applicationId,
  remindOn,
  createdAt,
});

function server(replies: { status: number; body: unknown }[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  replace.mockClear();
});

describe("ReminderSavedCheck", () => {
  it("says the reminder is saved, with the date of this card's newest reminder", async () => {
    server([
      {
        status: 200,
        body: {
          reminders: [
            reminder(ID, "2027-04-17", "2026-10-17T10:00:00Z"),
            reminder(ID, "2027-05-01", "2026-10-17T11:00:00Z"),
            reminder("00000000-0000-4000-8000-000000000002", "2027-06-01", "2026-10-17T12:00:00Z"),
          ],
        },
      },
    ]);
    render(<ReminderSavedCheck applicationId={ID} />);
    expect(await screen.findByRole("heading", { name: "Your reminder is saved" })).toBeTruthy();
    expect(screen.getAllByText(/May 1, 2027/).length).toBeGreaterThan(0);
  });

  it("never claims a reminder that is not saved for this card", async () => {
    server([{ status: 200, body: { reminders: [reminder("00000000-0000-4000-8000-000000000002", "2027-06-01", "2026-10-17T12:00:00Z")] } }]);
    render(<ReminderSavedCheck applicationId={ID} />);
    expect(await screen.findByRole("heading", { name: "We couldn’t find a reminder" })).toBeTruthy();
  });

  it("ends a load that throws on a screen with a retry, never on Checking", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadBug.throwOnce = true;
    server([{ status: 200, body: { reminders: [reminder(ID, "2027-04-17", "2026-10-17T10:00:00Z")] } }]);
    render(<ReminderSavedCheck applicationId={ID} />);
    expect(await screen.findByRole("heading", { name: "We couldn’t check your reminder" })).toBeTruthy();
    // The mistake is recorded, not swallowed.
    expect(error).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Your reminder is saved" })).toBeTruthy();
  });

  it("says the check failed, not that the reminder is missing, when the request fails", async () => {
    server([{ status: 500, body: {} }]);
    render(<ReminderSavedCheck applicationId={ID} />);
    expect(await screen.findByRole("heading", { name: "We couldn’t check your reminder" })).toBeTruthy();
  });

  it("sends a student whose session ended to sign in", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<ReminderSavedCheck applicationId={ID} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
  });
});
