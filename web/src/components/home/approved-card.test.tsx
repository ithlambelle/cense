// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";
import { listCards } from "@/lib/cards/catalog";
import { homeState } from "@/lib/home/state";
import { computeResult } from "@/lib/results/compute";

import { CONFETTI_MS } from "./approved-card";
import { HomeView } from "./home-view";

const replace = vi.fn();
// One router for every render, as in the app (useLoaded reloads when it changes).
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => router }));

const ID = "00000000-0000-4000-8000-000000000001";
const approved: Application = {
  id: ID,
  cardId: "discover-it-student-cash-back",
  cardName: "Discover it Student Cash Back",
  status: "approved",
  creditLimitCents: 50000,
  appliedAt: null,
  statusUpdatedAt: new Date().toISOString(),
};
const state = homeState([approved], computeResult(undefined, listCards()), true);
const NO_DETAIL = { denialReason: null, denialReasonNote: null, autopayStatus: "unknown", paymentDueDay: null } as const;
// The card's reminder days are saved, so a done payment_reminder step lights its star.
const DAYS_SAVED = { ...NO_DETAIL, paymentDueDay: 9 };

const PLAN_URL = `/api/v1/applications/${ID}/plans/first_month`;
const plan = (...steps: string[]) => ({
  applicationId: ID,
  plan: "first_month",
  completedSteps: steps.map((step) => ({ step, completedAt: "2026-10-22T00:00:00Z" })),
});
const saved = (step: string) => ({ step, completedAt: "2026-10-22T00:00:00Z" });

function server(replies: { status: number; body: unknown }[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    return reply.status === 204 ? new Response(null, { status: 204 }) : Response.json(reply.body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce") }));
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  return vibrate;
}

const star = (name: RegExp) => screen.getByRole("checkbox", { name });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  replace.mockClear();
  Reflect.deleteProperty(navigator, "vibrate");
  window.history.replaceState(null, "", "/");
});

describe("Home approved card", () => {
  it("celebrates once on the arrival from Mark result, then drops the flag", async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 22, 14, 0), toFake: ["Date"] });
    server([{ status: 200, body: plan() }, { status: 200, body: plan() }]);
    const vibrate = stubMotion(false);
    window.history.replaceState(null, "", `/home?celebrate=${ID}`);
    const { unmount } = render(<HomeView state={state} initial="M" celebrateId={ID} />);
    expect(screen.getByRole("heading", { level: 1, name: "You’re approved!" })).toBeTruthy();
    expect(screen.getByText("Thursday, October 22")).toBeTruthy();
    expect(screen.getByText("Approved Oct 22")).toBeTruthy();
    expect(screen.getByTestId("confetti").children).toHaveLength(36);
    await screen.findByText("0 of 3 lit");
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(40);
    // A reload reads the address without the flag.
    expect(window.location.search).toBe("");
    unmount();

    render(<HomeView state={state} initial="M" celebrateId={null} />);
    expect(screen.queryByTestId("confetti")).toBeNull();
    expect(screen.queryByText("You’re approved!")).toBeNull();
    expect(screen.queryByText(/^Approved /)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Good afternoon" })).toBeTruthy();
    expect(screen.getByText("$500")).toBeTruthy();
    await screen.findByText("0 of 3 lit");
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it("lets the star confetti fall once, then removes it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    server([{ status: 200, body: plan() }]);
    stubMotion(false);
    render(<HomeView state={state} initial="M" celebrateId={ID} />);
    expect(screen.getByTestId("confetti")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(CONFETTI_MS + 200);
    });
    expect(screen.queryByTestId("confetti")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "You’re approved!" })).toBeTruthy();
    vi.useRealTimers();
  });

  it("ignores a flag for another card, and keeps still for reduced motion", async () => {
    server([{ status: 200, body: plan() }, { status: 200, body: plan() }]);
    const vibrate = stubMotion(true);
    const { unmount } = render(<HomeView state={state} initial="M" celebrateId="00000000-0000-4000-8000-000000000009" />);
    expect(screen.queryByTestId("confetti")).toBeNull();
    await screen.findByText("0 of 3 lit");
    unmount();
    render(<HomeView state={state} initial="M" celebrateId={ID} />);
    await screen.findByText("0 of 3 lit");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("loads the saved stars and lights or puts out each one", async () => {
    const fetchFn = server([
      { status: 200, body: plan("payment_reminder") },
      { status: 201, body: saved("planned_purchase") },
      { status: 204, body: null },
    ]);
    render(<HomeView state={state} initial="M" detail={DAYS_SAVED} />);
    expect(await screen.findByText("1 of 3 lit")).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe(PLAN_URL);
    expect(star(/Plan one purchase/).getAttribute("aria-checked")).toBe("false");

    const purchase = star(/Plan one purchase/);
    await waitFor(() => expect(purchase.hasAttribute("disabled")).toBe(false));
    fireEvent.click(purchase);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe(`${PLAN_URL}/steps/planned_purchase`);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(screen.getByText("2 of 3 lit")).toBeTruthy();

    await waitFor(() => expect(purchase.hasAttribute("disabled")).toBe(false));
    fireEvent.click(purchase);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    expect(fetchFn.mock.calls[2][1]?.method).toBe("DELETE");
    await waitFor(() => expect(screen.getByText("1 of 3 lit")).toBeTruthy());
  });

  it("opens the reminder screen from the payment reminder row instead of ticking it, lit or not", async () => {
    const fetchFn = server([{ status: 200, body: plan() }, { status: 200, body: plan("payment_reminder") }]);
    const { unmount } = render(<HomeView state={state} initial="M" />);
    await screen.findByText("0 of 3 lit");
    expect(screen.queryByRole("checkbox", { name: /Set a payment reminder/ })).toBeNull();
    const row = screen.getByRole("link", { name: /^Set a payment reminder/ });
    expect(row.getAttribute("href")).toBe(`/applications/${ID}/reminders`);
    expect(row.textContent).not.toContain("done");
    fireEvent.click(row);
    // Nothing is saved from Home: the reminder screen lights the star when it saves.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    unmount();

    render(<HomeView state={state} initial="M" detail={DAYS_SAVED} />);
    await screen.findByText("1 of 3 lit");
    const lit = screen.getByRole("link", { name: /^Set a payment reminder\s*, done/ });
    expect(lit.getAttribute("href")).toBe(`/applications/${ID}/reminders`);
  });

  it("shows all stars lit once the three are done, saving autopay on the card", async () => {
    const fetchFn = server([
      { status: 200, body: plan("planned_purchase", "payment_reminder") },
      { status: 200, body: { ...approved, autopayStatus: "on" } },
      { status: 200, body: { ...approved, autopayStatus: "off" } },
    ]);
    render(<HomeView state={state} initial="M" detail={DAYS_SAVED} />);
    await screen.findByText("2 of 3 lit");
    expect(screen.queryByText(/All three stars lit/)).toBeNull();
    fireEvent.click(star(/Turn on autopay/));
    expect(screen.getByText("All stars lit")).toBeTruthy();
    expect(screen.getByText("All three stars lit. Your card is set up to build good credit.")).toBeTruthy();
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe(`/api/v1/applications/${ID}`);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({ autopayStatus: "on" });

    // Tapping it again undoes it: autopay is saved as off.
    await waitFor(() => expect(star(/Turn on autopay/).hasAttribute("disabled")).toBe(false));
    fireEvent.click(star(/Turn on autopay/));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchFn.mock.calls[2][1]?.body))).toEqual({ autopayStatus: "off" });
    await waitFor(() => expect(screen.getByText("2 of 3 lit")).toBeTruthy());
  });

  it("leaves the reminder star out when the step is done but no days are saved", async () => {
    server([{ status: 200, body: plan("payment_reminder") }]);
    render(<HomeView state={state} initial="M" detail={NO_DETAIL} />);
    expect(await screen.findByText("0 of 3 lit")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Set a payment reminder/ }).textContent).not.toContain("done");
  });

  it("leaves the reminder star out while the due-date email or every email is off, from any card", async () => {
    server([{ status: 200, body: plan("payment_reminder") }, { status: 200, body: plan("payment_reminder") }, { status: 200, body: plan("payment_reminder") }]);
    const { unmount } = render(<HomeView state={state} initial="M" detail={DAYS_SAVED} reminderSettings={{ paymentDue: false, emailsOn: true }} />);
    expect(await screen.findByText("0 of 3 lit")).toBeTruthy();
    unmount();
    const second = render(<HomeView state={state} initial="M" detail={DAYS_SAVED} reminderSettings={{ paymentDue: true, emailsOn: false }} />);
    expect(await screen.findByText("0 of 3 lit")).toBeTruthy();
    second.unmount();
    // back on: the saved step lights it again
    render(<HomeView state={state} initial="M" detail={DAYS_SAVED} reminderSettings={{ paymentDue: true, emailsOn: true }} />);
    expect(await screen.findByText("1 of 3 lit")).toBeTruthy();
  });

  it("counts a visit from a reminder email once, and drops the mark from the address", async () => {
    server([{ status: 200, body: plan() }]);
    window.history.replaceState(null, "", "/home?reminder=payment_due");
    render(<HomeView state={state} initial="M" fromReminder="payment_due" />);
    await screen.findByText("0 of 3 lit");
    expect(window.location.search).toBe("");
  });

  it("lights the autopay star when the card's autopay is on, and only then", async () => {
    server([{ status: 200, body: plan() }, { status: 200, body: plan() }]);
    const { unmount } = render(<HomeView state={state} initial="M" detail={{ ...NO_DETAIL, autopayStatus: "on" }} />);
    // On from the first paint, before the plan steps load.
    expect(star(/Turn on autopay/).getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText("1 of 3 lit")).toBeTruthy();
    expect(star(/Turn on autopay/).getAttribute("aria-checked")).toBe("true");
    unmount();
    render(<HomeView state={state} initial="M" detail={{ ...NO_DETAIL, autopayStatus: "unknown" }} />);
    expect(await screen.findByText("0 of 3 lit")).toBeTruthy();
    expect(star(/Turn on autopay/).getAttribute("aria-checked")).toBe("false");
  });

  it("puts the autopay star back out and shows the API's message when the save fails", async () => {
    server([
      { status: 200, body: plan() },
      { status: 400, body: { error: { code: "invalid_request", message: "The update is invalid." } } },
    ]);
    render(<HomeView state={state} initial="M" />);
    await screen.findByText("0 of 3 lit");
    fireEvent.click(star(/Turn on autopay/));
    expect((await screen.findByRole("alert")).textContent).toContain("The update is invalid.");
    expect(star(/Turn on autopay/).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("0 of 3 lit")).toBeTruthy();
  });

  it("sends a student whose session ended while saving autopay to sign in", async () => {
    server([
      { status: 200, body: plan() },
      { status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } },
    ]);
    render(<HomeView state={state} initial="M" detail={{ ...NO_DETAIL, autopayStatus: "on" }} />);
    await screen.findByText("1 of 3 lit");
    fireEvent.click(star(/Turn on autopay/));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
    expect(star(/Turn on autopay/).getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the dev gallery's sample stars on the page, with no requests", () => {
    const fetchFn = server([]);
    render(<HomeView state={state} initial="M" sampleStars={1} />);
    expect(screen.getByText("1 of 3 lit")).toBeTruthy();
    fireEvent.click(star(/Turn on autopay/));
    fireEvent.click(star(/Plan one purchase/));
    expect(screen.getByText("1 of 3 lit")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("undoes only the star whose save failed, keeping another that saved meanwhile", async () => {
    let failPurchase: (r: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      if (!init?.method || init.method === "GET") return Response.json(plan(), { status: 200 });
      if (String(url).endsWith("planned_purchase")) return new Promise<Response>((resolve) => { failPurchase = resolve; });
      return Response.json({ ...approved, autopayStatus: "on" }, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<HomeView state={state} initial="M" />);
    await screen.findByText("0 of 3 lit");
    fireEvent.click(star(/Plan one purchase/));
    expect(star(/Plan one purchase/).hasAttribute("disabled")).toBe(true);
    fireEvent.click(star(/Turn on autopay/));
    await waitFor(() => expect(star(/Turn on autopay/).getAttribute("aria-checked")).toBe("true"));
    failPurchase(Response.json({ error: { code: "internal_error", message: "Something broke." } }, { status: 500 }));
    expect((await screen.findByRole("alert")).textContent).toContain("Something broke.");
    expect(star(/Plan one purchase/).getAttribute("aria-checked")).toBe("false");
    expect(star(/Turn on autopay/).getAttribute("aria-checked")).toBe("true");
  });

  it("shows a failed load with a retry, and keeps the stars locked until it loads", async () => {
    server([
      { status: 503, body: { error: { code: "service_unavailable", message: "Try again in a moment." } } },
      { status: 200, body: plan("planned_purchase") },
    ]);
    render(<HomeView state={state} initial="M" />);
    expect((await screen.findByRole("alert")).textContent).toContain("Try again in a moment.");
    expect(star(/Plan one purchase/).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 of 3 lit")).toBeTruthy();
  });

  it("sends a student whose session ended to sign in, on load or on a save", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    const { unmount } = render(<HomeView state={state} initial="M" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
    unmount();
    replace.mockClear();

    server([
      { status: 200, body: plan() },
      { status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } },
    ]);
    render(<HomeView state={state} initial="M" />);
    await screen.findByText("0 of 3 lit");
    fireEvent.click(star(/Turn on autopay/));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
    expect(star(/Turn on autopay/).getAttribute("aria-checked")).toBe("false");
  });

  it("edits the limit in place and saves only the limit", async () => {
    const fetchFn = server([{ status: 200, body: plan() }, { status: 200, body: { ...approved, creditLimitCents: 125000 } }]);
    render(<HomeView state={state} initial="M" />);
    await screen.findByText("0 of 3 lit");
    fireEvent.click(screen.getByRole("button", { name: "Edit credit limit" }));
    const field = screen.getByLabelText("Credit limit") as HTMLInputElement;
    expect(field.value).toBe("500");
    // A bad amount is refused without a request.
    fireEvent.change(field, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter the limit in dollars, like 500 or 1,500.")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    fireEvent.change(field, { target: { value: "$1,250" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("$1,250");
    const [url, init] = fetchFn.mock.calls[1];
    expect(String(url)).toContain(`/api/v1/applications/${ID}`);
    expect(init?.method?.toUpperCase()).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ creditLimitCents: 125000 });
  });

  it("offers to add a limit when none is saved, and Cancel leaves it", async () => {
    server([{ status: 200, body: plan() }]);
    const noLimit = homeState([{ ...approved, creditLimitCents: null }], computeResult(undefined, listCards()), true);
    render(<HomeView state={noLimit} initial="M" />);
    await screen.findByText("0 of 3 lit");
    expect(screen.getByText("Not added")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add credit limit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Not added")).toBeTruthy();
  });

  it("opens the card's own page from its title row", async () => {
    server([{ status: 200, body: plan() }]);
    render(<HomeView state={state} initial="M" />);
    await screen.findByText("0 of 3 lit");
    expect(screen.getByRole("link", { name: `${approved.cardName} details` }).getAttribute("href")).toBe(
      `/cards/${approved.cardId}?from=home`,
    );
  });
});
