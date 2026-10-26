// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Application } from "@/lib/api/application";
import { listCards } from "@/lib/cards/catalog";
import { homeState, type CardDetail } from "@/lib/home/state";
import { computeResult } from "@/lib/results/compute";

import { HomeView } from "./home-view";

const replace = vi.fn();
const router = { push: vi.fn(), replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => router }));

const ID = "00000000-0000-4000-8000-000000000001";
const denied: Application = {
  id: ID,
  cardId: "discover-it-student-cash-back",
  cardName: "Discover it Student Cash Back",
  status: "rejected",
  creditLimitCents: null,
  appliedAt: null,
  statusUpdatedAt: new Date().toISOString(),
};
const state = homeState([denied], computeResult(undefined, listCards()), 0);
const detail = (denialReason: CardDetail["denialReason"], denialReasonNote: string | null = null): CardDetail => ({
  denialReason,
  denialReasonNote,
  autopayStatus: "unknown",
  paymentDueDay: null,
});

const PLAN_URL = `/api/v1/applications/${ID}/plans/denial`;
const plan = (...steps: string[]) => ({
  applicationId: ID,
  plan: "denial",
  completedSteps: steps.map((step) => ({ step, completedAt: "2026-10-22T00:00:00Z" })),
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

const link = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("Home denied card", () => {
  it("shows the reason, the denial plan's saved stars and the next step in one card", async () => {
    const fetchFn = server([{ status: 200, body: plan("read_letter", "check_reports") }]);
    render(<HomeView state={state} initial="M" detail={detail("no_credit_history")} />);
    expect(screen.getByText("NOT APPROVED")).toBeTruthy();
    expect(screen.getByText("Reason: not enough credit history")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "5-step plan" })).toBeTruthy();
    expect(await screen.findByText("2 of 5 lit")).toBeTruthy();
    expect(fetchFn.mock.calls[0][0]).toBe(PLAN_URL);
    expect(link(/NEXT STEP.*Pause new applications/)).toBe(`/denied/plan?application=${ID}`);
    expect(link("See my plan")).toBe(`/denied/plan?application=${ID}`);
    // Folded in and dropped (C9): no separate denial card, no card picture, no old rows.
    expect(screen.queryByText("A denial isn’t the end")).toBeNull();
    expect(screen.queryByText(/••••/)).toBeNull();
    expect(screen.queryByText("Card reminders")).toBeNull();
    expect(screen.queryByText("REJECTED")).toBeNull();
  });

  it("asks for the reason when none is saved", async () => {
    server([{ status: 200, body: plan() }]);
    render(<HomeView state={state} initial="M" detail={detail(null)} />);
    expect(screen.getByText("Reason: not added")).toBeTruthy();
    expect(link("Add the reason")).toBe(`/denied?application=${ID}`);
    expect(await screen.findByText("0 of 5 lit")).toBeTruthy();
    expect(link(/Read the issuer’s letter/)).toBe(`/denied/plan?application=${ID}`);
  });

  it("asks for the reason when Home could not read the card's detail", async () => {
    server([{ status: 200, body: plan() }]);
    render(<HomeView state={state} initial="M" />);
    expect(screen.getByText("Reason: not added")).toBeTruthy();
    await screen.findByText("0 of 5 lit");
  });

  it("says other for something else, not the student's own words", async () => {
    server([{ status: 200, body: plan() }]);
    render(<HomeView state={state} initial="M" detail={detail("something_else", "Too many recent applications")} />);
    expect(screen.getByText("Reason: other")).toBeTruthy();
    expect(screen.queryByText(/Too many recent applications/)).toBeNull();
    await screen.findByText("0 of 5 lit");
  });

  it("counts stars from the saved steps, and names the first step not done", async () => {
    server([{ status: 200, body: plan("check_reports", "reapply") }]);
    render(<HomeView state={state} initial="M" detail={detail("income")} />);
    expect(await screen.findByText("2 of 5 lit")).toBeTruthy();
    expect(screen.getByText("Read the issuer’s letter")).toBeTruthy();
  });

  it("drops the next step once all five stars are lit", async () => {
    server([{ status: 200, body: plan("read_letter", "check_reports", "pause_applications", "build_credit", "reapply") }]);
    render(<HomeView state={state} initial="M" detail={detail("income")} />);
    expect(await screen.findByText("All stars lit")).toBeTruthy();
    expect(screen.queryByText("NEXT STEP")).toBeNull();
    expect(link("See my plan")).toBe(`/denied/plan?application=${ID}`);
  });

  it("shows a failed load with a retry", async () => {
    server([
      { status: 503, body: { error: { code: "service_unavailable", message: "Try again in a moment." } } },
      { status: 200, body: plan("read_letter") },
    ]);
    render(<HomeView state={state} initial="M" detail={detail("income")} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Try again in a moment.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 of 5 lit")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sends a student whose session ended to sign in", async () => {
    server([{ status: 401, body: { error: { code: "unauthorized", message: "Sign in to continue." } } }]);
    render(<HomeView state={state} initial="M" detail={detail("income")} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?next=%2Fhome"));
  });

  it("shows the dev gallery's sample stars with no requests", () => {
    const fetchFn = server([]);
    render(<HomeView state={state} initial="M" detail={detail("no_credit_history")} sampleStars={2} />);
    expect(screen.getByText("2 of 5 lit")).toBeTruthy();
    expect(screen.getByText("Pause new applications")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("Home waiting on the letter", () => {
  it("says it is waiting, with one way back to the reason, and loads nothing", () => {
    const fetchFn = server([]);
    render(<HomeView state={state} initial="M" detail={detail("no_letter_yet")} />);
    expect(screen.getByText("NOT APPROVED")).toBeTruthy();
    expect(screen.getByText("Waiting on the issuer’s letter")).toBeTruthy();
    expect(link("I got my letter")).toBe(`/denied?application=${ID}`);
    expect(screen.queryByText(/Reason:/)).toBeNull();
    expect(screen.queryByText(/of 5 lit/)).toBeNull();
    expect(screen.queryByRole("link", { name: "See my plan" })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
