// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderSetup(
  days: { closing: number | null; due: number | null } = { closing: null, due: null },
  more: Partial<Parameters<typeof PaymentReminderSetup>[0]> = {},
) {
  render(
    <PaymentReminderSetup
      applicationId={ID}
      statementClosingDay={days.closing}
      paymentDueDay={days.due}
      savedChoices={ON}
      email="student@bu.edu"
      {...more}
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
  it("says the settings cover every card, and names the first-statement email only for a card that gets it", () => {
    renderSetup();
    expect(screen.getByText("Applies to all your cards.")).toBeTruthy();
    expect(screen.queryByText(/autopay check/)).toBeNull();
    cleanup();
    renderSetup(undefined, { firstStatementEmail: true });
    expect(
      screen.getByText("We’ll email you before your statement closes and before your bill is due, plus one autopay check after your first statement."),
    ).toBeTruthy();
  });

  it("goes back, and after saving returns, to the card's page when opened from it", async () => {
    const fetchFn = server({ status: 200 }, { status: 201, body: {} });
    renderSetup({ closing: 14, due: 9 }, { back: { href: "/cards/discover-it-student-cash-back", label: "Card details" }, doneHref: "/cards/discover-it-student-cash-back" });
    expect(screen.getByRole("link", { name: "Back to Card details" }).getAttribute("href")).toBe("/cards/discover-it-student-cash-back");
    fireEvent.click(saveButton());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cards/discover-it-student-cash-back"));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

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
    fireEvent.click(screen.getByRole("switch", { name: "3 days before the statement closes" }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
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
    expect(replace).not.toHaveBeenCalled();

    // Try again: the unsaved choice is sent again, then the star.
    fireEvent.click(saveButton());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(sent(fetchFn).slice(2).map(([method, url, body]) => [method, url, body])).toEqual([
      ["PATCH", `/api/v1/applications/${ID}`, { statementClosingDay: 14, paymentDueDay: 9 }],
      ["PATCH", "/api/v1/me/reminder-settings", { paymentDue: false }],
      // The due-date reminder is off, so the star is put out, not lit.
      ["DELETE", `/api/v1/applications/${ID}/plans/first_month/steps/payment_reminder`, undefined],
    ]);
  });

  it("shows the API's reason for a card that is not approved", async () => {
    server({ status: 400, body: { error: { code: "invalid_request", message: "Closing and due days are for an approved card." } } });
    renderSetup({ closing: 14, due: 9 });
    fireEvent.click(saveButton());
    expect((await screen.findByRole("alert")).textContent).toBe("Closing and due days are for an approved card.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out student to sign-in and back to this screen", async () => {
    server({ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } });
    renderSetup({ closing: 14, due: 9 });
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent(`/applications/${ID}/reminders`)}`),
    );
    expect(replace).not.toHaveBeenCalledWith("/home");
  });
});
