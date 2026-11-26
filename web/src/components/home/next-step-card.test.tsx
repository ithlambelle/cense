// @vitest-environment jsdom
// Created with Claude Code (2026-11-26). Home's next step card (N1 pattern):
// what it shows, its two analytics events, and what it stands in for on Home.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ SENSITIVE: "ph-sensitive", track: (...args: unknown[]) => track(...args) }));

import type { SafeToSpend } from "@/lib/api/safe-to-spend";
import { listCards } from "@/lib/cards/catalog";
import { nextStep, type NextStepInputs } from "@/lib/home/next-step";
import { homeState } from "@/lib/home/state";
import { computeResult } from "@/lib/results/compute";

import { HomeView } from "./home-view";
import { NextStepCard } from "./next-step-card";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const BANK = { answered: true, budgetChecked: true, lastMonth: null, essentialsCents: 92_500, savingsCents: 50_000, hasCardAccount: true };
const inputs = (extra: Partial<NextStepInputs> = {}): NextStepInputs => ({ bank: BANK, approvedCards: [], cardApplied: false, quizComplete: false, goal: null, ...extra });
const card = () => screen.getByRole("region", { name: "Start your emergency fund" });

describe("NextStepCard", () => {
  it("shows the eyebrow, the title, why this step first, one button and the flowchart credit", () => {
    render(<NextStepCard step={nextStep(inputs())} />);
    const region = card();
    expect(within(region).getByText("Your next step")).toBeTruthy();
    expect(within(region).getByRole("heading", { level: 2, name: "Start your emergency fund" })).toBeTruthy();
    expect(within(region).getByText("Why this step first")).toBeTruthy();
    expect(within(region).getByText(/^You have \$500 in savings\./)).toBeTruthy();
    // The why line carries the student's own amounts: masked in session replay.
    expect(within(region).getByText(/^You have \$500/).closest(".ph-sensitive")).not.toBeNull();
    const links = within(region).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([["Start my emergency fund", "/start/goal?preset=emergency_fund"]]);
    expect(within(region).getByText("Order from the r/personalfinance flowchart.")).toBeTruthy();
  });

  it("counts the step shown, and the tap, with the rule's id only", () => {
    const { rerender } = render(<NextStepCard step={nextStep(inputs())} />);
    expect(track).toHaveBeenCalledWith("next_step_shown", { step: "start_emergency_fund" });
    fireEvent.click(within(card()).getByRole("link"));
    expect(track).toHaveBeenCalledWith("next_step_tapped", { step: "start_emergency_fund" });
    // A new step is counted again; the same one re-rendered is not.
    track.mockClear();
    rerender(<NextStepCard step={nextStep(inputs())} />);
    expect(track).not.toHaveBeenCalled();
    rerender(<NextStepCard step={nextStep(inputs({ goal: { preset: "emergency_fund", name: "Emergency fund", accepted: true } }))} />);
    expect(track).toHaveBeenCalledWith("next_step_shown", { step: "your_goals" });
  });
});

describe("Home with a next step", () => {
  const NONE = computeResult(undefined, listCards());
  const linked = (extra: Partial<SafeToSpend> = {}): SafeToSpend => ({
    institutionName: "First Platypus Bank",
    status: "active",
    linkedAt: "2026-11-20T00:00:00.000Z",
    refreshedAt: new Date().toISOString(),
    answered: true,
    accounts: [],
    bills: [],
    setAsideCents: 0,
    cashCents: 105_000,
    cardCents: 0,
    billsCents: 0,
    leftCents: 105_000,
    days: 30,
    dailyCents: 3_500,
    ...extra,
  });

  it("sits under safe to spend", () => {
    render(<HomeView state={homeState([], NONE, 0)} initial="M" safeToSpend={linked()} nextStep={nextStep(inputs())} />);
    const hero = screen.getByRole("region", { name: "Safe to spend" });
    expect(hero.compareDocumentPosition(card()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Link your bank stands in for the safe-to-spend invite", () => {
    render(<HomeView state={homeState([], NONE, 0)} initial="M" safeToSpend={null} nextStep={nextStep(inputs({ bank: null }))} />);
    expect(screen.getByRole("region", { name: "Link your bank" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "See what’s safe to spend" })).toBeNull();
  });

  it("Check your budget stands in for Finish safe to spend before the bank is read, not after", () => {
    const unread = nextStep(inputs({ bank: { ...BANK, answered: false, budgetChecked: false } }));
    const { unmount } = render(<HomeView state={homeState([], NONE, 0)} initial="M" safeToSpend={linked({ answered: false })} nextStep={unread} />);
    expect(screen.getByRole("region", { name: "Check your budget" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Finish safe to spend" })).toBeNull();
    unmount();
    const unchecked = nextStep(inputs({ bank: { ...BANK, budgetChecked: false } }));
    render(<HomeView state={homeState([], NONE, 0)} initial="M" safeToSpend={linked()} nextStep={unchecked} />);
    expect(screen.getByRole("region", { name: "Check your budget" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Safe to spend" })).toBeTruthy();
  });

  it("Find your first card stands in for the quiz prompt; other steps leave it", () => {
    const { unmount } = render(
      <HomeView state={homeState([], NONE, 0)} initial="M" safeToSpend={linked()} nextStep={nextStep(inputs({ bank: { ...BANK, savingsCents: 200_000, hasCardAccount: false } }))} />,
    );
    expect(screen.getByRole("region", { name: "Find your first card" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /questions to your first card/ })).toBeNull();
    // I already have a card stays: the card may be at another bank.
    expect(screen.getByRole("link", { name: "I already have a card" })).toBeTruthy();
    unmount();
    render(<HomeView state={homeState([], NONE, 0)} initial="M" safeToSpend={linked()} nextStep={nextStep(inputs())} />);
    expect(screen.getByRole("heading", { name: /questions to your first card/ })).toBeTruthy();
  });

  it("is left out when there is no step", () => {
    render(<HomeView state={homeState([], NONE, 0)} initial="M" safeToSpend={linked()} />);
    expect(screen.queryByText("Your next step")).toBeNull();
  });
});
