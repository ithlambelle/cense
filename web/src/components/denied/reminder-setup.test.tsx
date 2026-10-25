// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReminderSetup } from "./reminder-setup";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/denied/reminder", useRouter: () => ({ push, replace, refresh: vi.fn() }) }));

const ID = "00000000-0000-4000-8000-000000000001";

function server(status: number, body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () =>
    typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status }),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

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
    server(404, "<html>404</html>");
    render(<ReminderSetup applicationId={ID} />);
    expect(screen.getByText("April 17, 2027")).toBeTruthy();
  });

  it("links the before-you-reapply card to this card's plan", () => {
    server(404, "<html>404</html>");
    render(<ReminderSetup applicationId={ID} />);
    expect(screen.getByRole("link", { name: "See the 5-step plan" }).getAttribute("href")).toBe(`/denied/plan?application=${ID}`);
  });

  it("refuses today, and saves nothing", () => {
    const fetchFn = server(404, "<html>404</html>");
    render(<ReminderSetup applicationId={ID} />);
    chooseDate("2026-10-17");
    expect(screen.getByRole("alert").textContent).toContain("Pick a date after today.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a typed date past the one-year limit the date picker suggests", () => {
    const fetchFn = server(404, "<html>404</html>");
    render(<ReminderSetup applicationId={ID} />);
    chooseDate("2027-10-18");
    expect(screen.getByRole("alert").textContent).toContain("Pick a date no later than October 17, 2027.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("accepts the last allowed day and opens the saved check for this card", async () => {
    const fetchFn = server(201, {
      id: "00000000-0000-4000-8000-0000000000aa",
      applicationId: ID,
      remindOn: "2027-10-17",
      createdAt: "2026-10-17T13:00:00Z",
    });
    render(<ReminderSetup applicationId={ID} />);
    chooseDate("2027-10-17");
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/denied/reminder/saved?application=${ID}`));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ applicationId: ID, remindOn: "2027-10-17" });
  });

  it("says reminders are not on yet while the route is missing, with the date to note down", async () => {
    server(404, "<html>404</html>");
    render(<ReminderSetup applicationId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Save reapply reminder" }));
    expect(await screen.findByRole("heading", { name: "Reminder emails aren’t on yet" })).toBeTruthy();
    expect(screen.getByText(/nothing was saved\. Note the date for now: April 17, 2027\./)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("asks to start from Home when no card is given", () => {
    render(<ReminderSetup applicationId={null} />);
    expect(screen.getByText("Open this from your card on Home to set a reminder for it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save reapply reminder" })).toBeNull();
  });
});
