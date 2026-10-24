// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";
import { listCards } from "@/lib/cards/catalog";
import { homeState } from "@/lib/home/state";
import { computeResult } from "@/lib/results/compute";

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
    expect(screen.getByTestId("burst").children).toHaveLength(12);
    await screen.findByText("0 of 3 lit");
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(40);
    // A reload reads the address without the flag.
    expect(window.location.search).toBe("");
    unmount();

    render(<HomeView state={state} initial="M" celebrateId={null} />);
    expect(screen.queryByTestId("burst")).toBeNull();
    expect(screen.queryByText("You’re approved!")).toBeNull();
    expect(screen.queryByText(/^Approved /)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Good afternoon" })).toBeTruthy();
    expect(screen.getByText("$500")).toBeTruthy();
    await screen.findByText("0 of 3 lit");
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it("ignores a flag for another card, and keeps still for reduced motion", async () => {
    server([{ status: 200, body: plan() }, { status: 200, body: plan() }]);
    const vibrate = stubMotion(true);
    const { unmount } = render(<HomeView state={state} initial="M" celebrateId="00000000-0000-4000-8000-000000000009" />);
    expect(screen.queryByTestId("burst")).toBeNull();
    await screen.findByText("0 of 3 lit");
    unmount();
    render(<HomeView state={state} initial="M" celebrateId={ID} />);
    await screen.findByText("0 of 3 lit");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("loads the saved stars and lights or puts out each one", async () => {
    const fetchFn = server([
      { status: 200, body: plan("planned_purchase") },
      { status: 201, body: saved("payment_reminder") },
      { status: 204, body: null },
    ]);
    render(<HomeView state={state} initial="M" />);
    expect(await screen.findByText("1 of 3 lit")).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe(PLAN_URL);
    expect(star(/Plan one purchase/).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(star(/Set a payment reminder/));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe(`${PLAN_URL}/steps/payment_reminder`);
    expect(fetchFn.mock.calls[1][1]?.method).toBe("PUT");
    expect(screen.getByText("2 of 3 lit")).toBeTruthy();

    const purchase = star(/Plan one purchase/);
    await waitFor(() => expect(purchase.hasAttribute("disabled")).toBe(false));
    fireEvent.click(purchase);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    expect(fetchFn.mock.calls[2][1]?.method).toBe("DELETE");
    await waitFor(() => expect(screen.getByText("1 of 3 lit")).toBeTruthy());
  });

  it("shows all stars lit once the three are done, with autopay kept on the page only", async () => {
    const fetchFn = server([{ status: 200, body: plan("planned_purchase", "payment_reminder") }]);
    render(<HomeView state={state} initial="M" />);
    await screen.findByText("2 of 3 lit");
    expect(screen.queryByText(/All three stars lit/)).toBeNull();
    fireEvent.click(star(/Turn on autopay/));
    expect(screen.getByText("All stars lit")).toBeTruthy();
    expect(screen.getByText("All three stars lit. Your card is set up to build good credit.")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("undoes only the star whose save failed, keeping another that saved meanwhile", async () => {
    let failPurchase: (r: Response) => void = () => undefined;
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      if (!init?.method || init.method === "GET") return Response.json(plan(), { status: 200 });
      if (String(url).endsWith("planned_purchase")) return new Promise<Response>((resolve) => { failPurchase = resolve; });
      return Response.json(saved("payment_reminder"), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<HomeView state={state} initial="M" />);
    await screen.findByText("0 of 3 lit");
    fireEvent.click(star(/Plan one purchase/));
    expect(star(/Plan one purchase/).hasAttribute("disabled")).toBe(true);
    fireEvent.click(star(/Set a payment reminder/));
    await waitFor(() => expect(star(/Set a payment reminder/).getAttribute("aria-checked")).toBe("true"));
    failPurchase(Response.json({ error: { code: "internal_error", message: "Something broke." } }, { status: 500 }));
    expect((await screen.findByRole("alert")).textContent).toContain("Something broke.");
    expect(star(/Plan one purchase/).getAttribute("aria-checked")).toBe("false");
    expect(star(/Set a payment reminder/).getAttribute("aria-checked")).toBe("true");
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
    fireEvent.click(star(/Set a payment reminder/));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
    expect(star(/Set a payment reminder/).getAttribute("aria-checked")).toBe("false");
  });

  it("edits the limit on Mark result, and offers to add one when none is saved", async () => {
    server([{ status: 200, body: plan() }, { status: 200, body: plan() }]);
    const { unmount } = render(<HomeView state={state} initial="M" />);
    expect(screen.getByRole("link", { name: "Edit credit limit" }).getAttribute("href")).toBe(`/applications/${ID}`);
    await screen.findByText("0 of 3 lit");
    unmount();
    const noLimit = homeState([{ ...approved, creditLimitCents: null }], computeResult(undefined, listCards()), true);
    render(<HomeView state={noLimit} initial="M" />);
    expect(screen.getByText("Not added")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add credit limit" }).getAttribute("href")).toBe(`/applications/${ID}`);
    await screen.findByText("0 of 3 lit");
  });
});
