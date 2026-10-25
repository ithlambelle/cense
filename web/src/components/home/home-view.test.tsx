// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listCards } from "@/lib/cards/catalog";
import { RESULT_HEADLINES } from "@/lib/copy/results";
import type { Application } from "@/lib/api/application";
import { homeState } from "@/lib/home/state";
import { computeResult } from "@/lib/results/compute";

import { HomeView } from "./home-view";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => router }));

// An approved or denied card loads its plan's stars (approved-card.test.tsx and
// denied-card.test.tsx cover them).
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ applicationId: "x", plan: "first_month", completedSteps: [] })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const cards = listCards();
const NONE = computeResult(undefined, cards);
const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
const ID = "00000000-0000-4000-8000-000000000001";

function app(status: Application["status"], extra: Partial<Application> = {}): Application {
  return { id: ID, cardId: null, cardName: "Student Cash Card", status, creditLimitCents: null, appliedAt: null, statusUpdatedAt: new Date().toISOString(), ...extra };
}

const link = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

describe("HomeView", () => {
  it("offers the quiz when nothing is saved, and to continue it when started", () => {
    const { unmount } = render(<HomeView state={homeState([], NONE, false)} initial="M" />);
    expect(screen.getByRole("heading", { name: "6 questions to your first card" })).toBeTruthy();
    expect(link("Start the quiz")).toBe("/quiz");
    unmount();
    render(<HomeView state={homeState([], computeResult({ under21: true }, cards), true)} initial="M" />);
    expect(link("Continue the quiz")).toBe("/quiz");
  });

  it("shows the match and sends the student to its card page", () => {
    const state = homeState([], computeResult(ALL_SIX, cards), true);
    if (state.kind !== "matched") throw new Error("expected a match");
    expect(state.result.fit.tier).toBe("likely_fit");
    render(<HomeView state={state} initial="M" />);
    expect(screen.getByText("Likely fit")).toBeTruthy();
    expect(screen.getByText(`${RESULT_HEADLINES.likely_fit}.`)).toBeTruthy();
    expect(link("View card")).toBe(`/cards/${state.result.card.id}?from=home`);
    // The whole match card opens the result (students tapped it in interviews).
    expect(link("See your match")).toBe("/results");
  });

  it("never calls a stretch a sure match: tier label, its first caution and a link to the reasons", () => {
    const state = homeState([], computeResult({ ...ALL_SIX, recentDenial: true }, cards), true);
    if (state.kind !== "matched") throw new Error("expected a match");
    expect(state.result.fit.tier).toBe("stretch");
    render(<HomeView state={state} initial="M" />);
    expect(screen.getByText("Stretch")).toBeTruthy();
    expect(screen.getByText(`${RESULT_HEADLINES.stretch}.`)).toBeTruthy();
    expect(screen.getByText(state.result.fit.reasons[0])).toBeTruthy();
    expect(link("See why")).toBe("/results");
    expect(screen.queryByText("Likely fit")).toBeNull();
    expect(screen.queryByText(/match is ready/)).toBeNull();
    expect(screen.queryByText(/does not affect your credit score/)).toBeNull();
  });

  it("explains a no-card result and links to the reason", () => {
    render(<HomeView state={homeState([], computeResult({ ...ALL_SIX, incomeBand: "none" }, cards), true)} initial="M" />);
    expect(screen.getByRole("heading", { name: "No card fits yet" })).toBeTruthy();
    expect(link("See why")).toBe("/results");
  });

  it("asks an applied student what the issuer decided", () => {
    render(<HomeView state={homeState([app("applied")], NONE, true)} initial="M" />);
    expect(screen.getByText("APPLIED")).toBeTruthy();
    expect(link("Update my status")).toBe(`/applications/${ID}`);
  });

  it("makes a catalog card on Home one link to its card page, and leaves a hand-added card to its next step", () => {
    const { unmount } = render(<HomeView state={homeState([app("applied", { cardId: "discover-it-student-cash-back" })], NONE, true)} initial="M" />);
    expect(link("View card details")).toBe("/cards/discover-it-student-cash-back?from=home");
    unmount();
    render(<HomeView state={homeState([app("rejected")], NONE, true)} initial="M" />);
    expect(screen.queryByRole("link", { name: "View card details" })).toBeNull();
  });

  it("shows a denied card as one module with its plan (denied-card.test.tsx covers it)", async () => {
    render(<HomeView state={homeState([app("rejected")], NONE, true)} initial="M" />);
    expect(screen.getByText("NOT APPROVED")).toBeTruthy();
    expect(link("See my plan")).toBe(`/denied/plan?application=${ID}`);
    expect(await screen.findByText("0 of 5 lit")).toBeTruthy();
  });

  it("calls a denied card in the list NOT APPROVED and opens its denial guide", () => {
    const older = app("rejected", { id: "00000000-0000-4000-8000-000000000002", cardName: "Older Card", statusUpdatedAt: "2026-01-01T00:00:00Z" });
    render(<HomeView state={homeState([older, app("applied")], NONE, true)} initial="M" />);
    expect(screen.getByRole("link", { name: /Older Card/ }).textContent).toContain("NOT APPROVED");
    expect(screen.getByRole("link", { name: /Older Card/ }).getAttribute("href")).toBe(
      "/denied?application=00000000-0000-4000-8000-000000000002",
    );
  });

  it("shows an approved card as one module: limit, first month and three steps, without a status pill", async () => {
    render(<HomeView state={homeState([app("approved", { creditLimitCents: 50000 })], NONE, true)} initial="M" />);
    expect(screen.getByText("$500")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your first month" })).toBeTruthy();
    // Two steps tick here; the payment reminder opens its own screen.
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /^Set a payment reminder/ })).toBeTruthy();
    expect(screen.queryByText("APPROVED")).toBeNull();
    expect(await screen.findByText("0 of 3 lit")).toBeTruthy();
  });

  it("writes a limit with a thousands separator, and cents only when there are some", async () => {
    const { unmount } = render(<HomeView state={homeState([app("approved", { creditLimitCents: 150000 })], NONE, true)} initial="M" />);
    expect(screen.getByText("$1,500")).toBeTruthy();
    unmount();
    render(<HomeView state={homeState([app("approved", { creditLimitCents: 150050 })], NONE, true)} initial="M" />);
    expect(screen.getByText("$1,500.50")).toBeTruthy();
    await screen.findByText("0 of 3 lit");
  });

  it("lists other tracked cards below the newest one", () => {
    const older = app("approved", { id: "00000000-0000-4000-8000-000000000002", cardName: "Older Card", statusUpdatedAt: "2026-01-01T00:00:00Z" });
    render(<HomeView state={homeState([older, app("applied")], NONE, true)} initial="M" />);
    expect(screen.getByRole("heading", { name: "Your other cards" })).toBeTruthy();
    // Each approved card opens its own plan, not the newest approved card's.
    expect(screen.getByRole("link", { name: /Older Card/ }).getAttribute("href")).toBe(
      "/plan?application=00000000-0000-4000-8000-000000000002",
    );
  });

  it("links the profile circle, with the student's initial, to the account screen and marks Home in the bottom bar", () => {
    render(<HomeView state={homeState([], NONE, false)} initial="M" />);
    expect(link("Profile")).toBe("/settings");
    expect(screen.getByRole("link", { name: "Profile" }).textContent).toBe("M");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
  });
});
