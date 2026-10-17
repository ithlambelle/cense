// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listCards } from "@/lib/cards/catalog";
import { RESULT_HEADLINES } from "@/lib/copy/results";
import { homeState, type Application } from "@/lib/home/state";
import { computeResult } from "@/lib/results/compute";

import { HomeView } from "./home-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));

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
    const { unmount } = render(<HomeView state={homeState([], NONE, false)} />);
    expect(screen.getByRole("heading", { name: "6 questions to your first card" })).toBeTruthy();
    expect(link("Start the quiz")).toBe("/quiz");
    unmount();
    render(<HomeView state={homeState([], computeResult({ under21: true }, cards), true)} />);
    expect(link("Continue the quiz")).toBe("/quiz");
  });

  it("shows the match and sends the student to its card page", () => {
    const state = homeState([], computeResult(ALL_SIX, cards), true);
    if (state.kind !== "matched") throw new Error("expected a match");
    expect(state.result.fit.tier).toBe("likely_fit");
    render(<HomeView state={state} />);
    expect(screen.getByText("LIKELY FIT")).toBeTruthy();
    expect(screen.getByText(`${RESULT_HEADLINES.likely_fit}.`)).toBeTruthy();
    expect(link("View card")).toBe(`/cards/${state.result.card.id}`);
  });

  it("never calls a stretch a sure match: tier label, its first caution and a link to the reasons", () => {
    const state = homeState([], computeResult({ ...ALL_SIX, recentDenial: true }, cards), true);
    if (state.kind !== "matched") throw new Error("expected a match");
    expect(state.result.fit.tier).toBe("stretch");
    render(<HomeView state={state} />);
    expect(screen.getByText("STRETCH")).toBeTruthy();
    expect(screen.getByText(`${RESULT_HEADLINES.stretch}.`)).toBeTruthy();
    expect(screen.getByText(state.result.fit.reasons[0])).toBeTruthy();
    expect(link("See why")).toBe("/results");
    expect(screen.queryByText("LIKELY FIT")).toBeNull();
    expect(screen.queryByText(/match is ready/)).toBeNull();
    expect(screen.queryByText(/does not affect your credit score/)).toBeNull();
  });

  it("explains a no-card result and links to the reason", () => {
    render(<HomeView state={homeState([], computeResult({ ...ALL_SIX, incomeBand: "none" }, cards), true)} />);
    expect(screen.getByRole("heading", { name: "No card fits yet" })).toBeTruthy();
    expect(link("See why")).toBe("/results");
  });

  it("asks an applied student what the issuer decided", () => {
    render(<HomeView state={homeState([app("applied")], NONE, true)} />);
    expect(screen.getByText("APPLIED")).toBeTruthy();
    expect(link("Update my status")).toBe(`/applications/${ID}`);
  });

  it("shows a rejected card as drawn, with the denial guide as the next step", () => {
    render(<HomeView state={homeState([app("rejected")], NONE, true)} />);
    expect(screen.getByText("REJECTED")).toBeTruthy();
    expect(screen.getByText("Card reminders")).toBeTruthy();
    expect(link("I was denied")).toBe(`/denied?application=${ID}`);
  });

  it("shows an approved card's limit and the first-month plan for that card", () => {
    render(<HomeView state={homeState([app("approved", { creditLimitCents: 50000 })], NONE, true)} />);
    expect(screen.getByText("$500")).toBeTruthy();
    expect(link("See my first-month plan")).toBe(`/plan?application=${ID}`);
  });

  it("writes a limit with a thousands separator, and cents only when there are some", () => {
    const { unmount } = render(<HomeView state={homeState([app("approved", { creditLimitCents: 150000 })], NONE, true)} />);
    expect(screen.getByText("$1,500")).toBeTruthy();
    unmount();
    render(<HomeView state={homeState([app("approved", { creditLimitCents: 150050 })], NONE, true)} />);
    expect(screen.getByText("$1,500.50")).toBeTruthy();
  });

  it("lists other tracked cards below the newest one", () => {
    const older = app("approved", { id: "00000000-0000-4000-8000-000000000002", cardName: "Older Card", statusUpdatedAt: "2026-01-01T00:00:00Z" });
    render(<HomeView state={homeState([older, app("applied")], NONE, true)} />);
    expect(screen.getByRole("heading", { name: "Your other cards" })).toBeTruthy();
    // Each approved card opens its own plan, not the newest approved card's.
    expect(screen.getByRole("link", { name: /Older Card/ }).getAttribute("href")).toBe(
      "/plan?application=00000000-0000-4000-8000-000000000002",
    );
  });

  it("links the avatar to the account screen and marks Home in the bottom bar", () => {
    render(<HomeView state={homeState([], NONE, false)} />);
    expect(link("Your account")).toBe("/settings");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
  });
});
