// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaymentReminderSetup } from "./payment-reminder-setup";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/applications/x/reminders",
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
}));

const ID = "00000000-0000-4000-8000-000000000001";
const ON = { paymentDue: true, statementClosing: true };

type Reply = { status: number; body?: unknown };

function server(...replies: Reply[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift() ?? { status: 200, body: {} };
    return Response.json(reply.body ?? {}, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const sent = (fetchFn: ReturnType<typeof server>) =>
  fetchFn.mock.calls.map(([url, init]) => [init?.method, url, init?.body === undefined ? undefined : JSON.parse(String(init.body))]);

function renderSetup(days: { closing: number | null; due: number | null } = { closing: null, due: null }) {
  render(
    <PaymentReminderSetup
      applicationId={ID}
      statementClosingDay={days.closing}
      paymentDueDay={days.due}
      savedChoices={ON}
      email="student@bu.edu"
    />,
  );
}

const closingField = () => screen.getByLabelText("Statement closes on day") as HTMLInputElement;
const dueField = () => screen.getByLabelText("Payment due on day") as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Save reminders" });

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  replace.mockClear();
});

describe("PaymentReminderSetup", () => {
  it("starts from the saved days and choices", () => {
    renderSetup({ closing: 14, due: 9 });
    expect(closingField().value).toBe("14");
    expect(dueField().value).toBe("9");
    expect(screen.getByRole("switch", { name: "3 days before the due date" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Email to student@bu.edu")).toBeTruthy();
  });

  it("asks for a day from 1 to 31 and sends nothing until both are valid", () => {
    const fetchFn = server();
    renderSetup();
    fireEvent.change(closingField(), { target: { value: "32" } });
    fireEvent.change(dueField(), { target: { value: "0" } });
    fireEvent.click(saveButton());
    expect(screen.getAllByText("Enter a day from 1 to 31.")).toHaveLength(2);
    fireEvent.change(closingField(), { target: { value: "31" } });
    fireEvent.click(saveButton());
    expect(screen.getAllByText("Enter a day from 1 to 31.")).toHaveLength(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("saves the days, the changed toggle and the star in order, then goes Home", async () => {
    const fetchFn = server({ status: 200 }, { status: 200 }, { status: 200 });
    renderSetup();
    fireEvent.change(closingField(), { target: { value: "14" } });
    fireEvent.change(dueField(), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("switch", { name: "When the statement closes" }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
    expect(sent(fetchFn)).toEqual([
      ["PATCH", `/api/v1/applications/${ID}`, { statementClosingDay: 14, paymentDueDay: 9 }],
      ["PATCH", "/api/v1/me/reminder-settings", { statementClosing: false }],
      ["PUT", `/api/v1/applications/${ID}/plans/first_month/steps/payment_reminder`, undefined],
    ]);
  });

  it("stays with a clear message when the choices fail, never lights the star, and retries", async () => {
    const fetchFn = server(
      { status: 200 },
      { status: 503, body: { error: { code: "data_unavailable", message: "Your data is temporarily unavailable. Please try again." } } },
    );
    renderSetup({ closing: 14, due: 9 });
    fireEvent.click(screen.getByRole("switch", { name: "3 days before the due date" }));
    fireEvent.click(saveButton());
    expect((await screen.findByRole("alert")).textContent).toContain("Your dates are saved, but your reminder choices are not.");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sent(fetchFn).some(([method]) => method === "PUT")).toBe(false);
    expect(push).not.toHaveBeenCalled();

    // Try again: the unsaved choice is sent again, then the star.
    fireEvent.click(saveButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/home"));
    expect(sent(fetchFn).slice(2).map(([method, url, body]) => [method, url, body])).toEqual([
      ["PATCH", `/api/v1/applications/${ID}`, { statementClosingDay: 14, paymentDueDay: 9 }],
      ["PATCH", "/api/v1/me/reminder-settings", { paymentDue: false }],
      ["PUT", `/api/v1/applications/${ID}/plans/first_month/steps/payment_reminder`, undefined],
    ]);
  });

  it("shows the API's reason for a card that is not approved", async () => {
    server({ status: 400, body: { error: { code: "invalid_request", message: "Closing and due days are for an approved card." } } });
    renderSetup({ closing: 14, due: 9 });
    fireEvent.click(saveButton());
    expect((await screen.findByRole("alert")).textContent).toBe("Closing and due days are for an approved card.");
    expect(push).not.toHaveBeenCalled();
  });

  it("sends a signed-out student to sign-in and back to this screen", async () => {
    server({ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } });
    renderSetup({ closing: 14, due: 9 });
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent(`/applications/${ID}/reminders`)}`),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
