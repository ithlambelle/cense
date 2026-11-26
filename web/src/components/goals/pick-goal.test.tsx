// @vitest-environment jsdom
// Created with Claude Code (2026-11-26). Pick a goal: three presets first,
// the rest behind More goals, the suggested amount and where it came from,
// the checks before saving, and a saved goal coming back filled in.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
const saveGoal = vi.fn();
const deleteGoal = vi.fn();
vi.mock("@/lib/api-client/goals", () => ({
  saveGoal: (...args: unknown[]) => saveGoal(...args),
  deleteGoal: (...args: unknown[]) => deleteGoal(...args),
}));
const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ SENSITIVE: "ph-sensitive", track: (...args: unknown[]) => track(...args) }));

import type { Goal } from "@/lib/api/goals";

import { PickGoal } from "./pick-goal";

const SUGGESTIONS = {
  emergency_fund: { amountCents: 124_000, source: "essentials" as const },
  pay_off_card: { amountCents: 31_000, source: "card_balance" as const },
};
const TODAY = "2026-11-26";

const goals = () => within(screen.getByRole("group", { name: "Pick a goal" }));
const choose = (name: string) => fireEvent.click(goals().getByRole("button", { name }));
const amount = () => screen.getByLabelText("How much?") as HTMLInputElement;
const date = () => screen.getByLabelText("By when?") as HTMLInputElement;
const submit = () => fireEvent.click(screen.getByRole("button", { name: "See my plan" }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("PickGoal", () => {
  it("shows three goals first and the rest behind More goals, with no Start investing", () => {
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(goals().getAllByRole("button").map((button) => button.textContent)).toEqual(["Emergency fund", "Pay off my card", "Trip"]);
    fireEvent.click(screen.getByRole("button", { name: "More goals" }));
    expect(goals().getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Emergency fund",
      "Pay off my card",
      "Trip",
      "Buy a car",
      "Buy a home",
      "Something else",
    ]);
    expect(screen.queryByText(/invest/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "More goals" })).toBeNull();
  });

  it("fills in the suggested amount and says where it came from", () => {
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Emergency fund");
    expect(amount().value).toBe("1240");
    expect(screen.getByText("Suggested $1,240: one month of your rent, bills and groceries.")).toBeTruthy();
    choose("Pay off my card");
    expect(amount().value).toBe("310");
    expect(screen.getByText("Suggested $310: what your card owes today, from your bank.")).toBeTruthy();
    choose("Trip");
    expect(amount().value).toBe("");
    expect(screen.queryByText(/^Suggested/)).toBeNull();
  });

  it("asks for a goal, then an amount, before saving", async () => {
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    submit();
    expect(screen.getByText("Pick a goal.")).toBeTruthy();
    choose("Trip");
    for (const typed of ["", "0", "abc", "12,34"]) {
      fireEvent.change(amount(), { target: { value: typed } });
      submit();
      expect(screen.getByText("Enter an amount, like 500."), typed).toBeTruthy();
    }
    expect(saveGoal).not.toHaveBeenCalled();
  });

  it("asks no date for Pay off my card", async () => {
    saveGoal.mockResolvedValue({ kind: "ok", data: { goal: {} } });
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Pay off my card");
    expect(screen.queryByLabelText("By when?")).toBeNull();
    submit();
    await waitFor(() => expect(saveGoal).toHaveBeenCalledWith({ preset: "pay_off_card", name: "Pay off my card", amountCents: 31_000, targetDate: null }));
  });

  it("says the most a goal can be when the amount is over it", () => {
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Trip");
    fireEvent.change(amount(), { target: { value: "1,000,001" } });
    submit();
    expect(screen.getByText("Goals go up to $1,000,000.")).toBeTruthy();
    expect(screen.queryByText("Enter an amount, like 500.")).toBeNull();
    expect(saveGoal).not.toHaveBeenCalled();
  });

  it("asks what Something else is for when the name only looks blank, as the server would", () => {
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "More goals" }));
    choose("Something else");
    fireEvent.change(screen.getByLabelText("What is it for?"), { target: { value: "\u200b\u3164" } });
    fireEvent.change(amount(), { target: { value: "400" } });
    submit();
    expect(screen.getByText("Say what it’s for.")).toBeTruthy();
    expect(saveGoal).not.toHaveBeenCalled();
  });

  it("says switching an accepted goal to Pay off my card stops its set-aside, or that a changed one stays", () => {
    const trip: Goal = { preset: "trip", name: "Trip", amountCents: 120_000, targetDate: "2027-05-26", dateChosen: false, monthlyCents: 20_000, acceptedMonthlyCents: 20_000, updatedAt: "2026-11-26T15:00:00.000Z" };
    const { unmount } = render(<PickGoal saved={trip} setAsideCents={20_000} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(screen.queryByText(/set-aside/)).toBeNull();
    choose("Pay off my card");
    expect(screen.getByText("Your $200 a month set-aside stops too.")).toBeTruthy();
    unmount();
    render(<PickGoal saved={trip} setAsideCents={7_500} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Pay off my card");
    expect(screen.getByText("Your $75 a month set-aside stays; change it on Your money.")).toBeTruthy();
  });

  it("shows no date for a goal saved without one, and saves it again without one", async () => {
    saveGoal.mockResolvedValue({ kind: "ok", data: { goal: {} } });
    const fund: Goal = { preset: "emergency_fund", name: "Emergency fund", amountCents: 100_000, targetDate: "2027-05-26", dateChosen: false, monthlyCents: 16_667, acceptedMonthlyCents: null, updatedAt: "2026-11-26T15:00:00.000Z" };
    render(<PickGoal saved={fund} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(date().value).toBe("");
    submit();
    await waitFor(() => expect(saveGoal).toHaveBeenCalledWith({ preset: "emergency_fund", name: "Emergency fund", amountCents: 100_000, targetDate: null }));
    expect(track).toHaveBeenCalledWith("goal_saved", { preset: "emergency_fund", amount: "typed", dated: false });
  });

  it("asks what Something else is for", () => {
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "More goals" }));
    choose("Something else");
    fireEvent.change(amount(), { target: { value: "400" } });
    submit();
    expect(screen.getByText("Say what it’s for.")).toBeTruthy();
    expect(saveGoal).not.toHaveBeenCalled();
  });

  it("refuses a date that is not after today, or too far out", () => {
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Trip");
    fireEvent.change(amount(), { target: { value: "600" } });
    expect(date().min).toBe("2026-11-27");
    for (const typed of ["2026-11-26", "2025-01-01"]) {
      fireEvent.change(date(), { target: { value: typed } });
      submit();
      expect(screen.getByText("Pick a date after today.")).toBeTruthy();
    }
    fireEvent.change(date(), { target: { value: "2057-01-01" } });
    submit();
    expect(screen.getByText("Pick a date in the next 30 years.")).toBeTruthy();
    expect(saveGoal).not.toHaveBeenCalled();
  });

  it("saves the suggestion with no date, then opens Your plan", async () => {
    saveGoal.mockResolvedValue({ kind: "ok", data: { goal: {} } });
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Emergency fund");
    submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/start/plan"));
    expect(saveGoal).toHaveBeenCalledWith({ preset: "emergency_fund", name: "Emergency fund", amountCents: 124_000, targetDate: null });
    expect(track).toHaveBeenCalledWith("goal_saved", { preset: "emergency_fund", amount: "suggested", dated: false });
  });

  it("saves a typed amount and a date, and counts it as typed", async () => {
    saveGoal.mockResolvedValue({ kind: "ok", data: { goal: {} } });
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Emergency fund");
    fireEvent.change(amount(), { target: { value: "$2,000" } });
    fireEvent.change(date(), { target: { value: "2027-06-01" } });
    submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/start/plan"));
    expect(saveGoal).toHaveBeenCalledWith({ preset: "emergency_fund", name: "Emergency fund", amountCents: 200_000, targetDate: "2027-06-01" });
    expect(track).toHaveBeenCalledWith("goal_saved", { preset: "emergency_fund", amount: "typed", dated: true });
  });

  it("says why a save failed and stays", async () => {
    saveGoal.mockResolvedValue({ kind: "failed", code: "data_unavailable", message: "Your data is temporarily unavailable. Please try again." });
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Emergency fund");
    submit();
    expect(await screen.findByText("Your data is temporarily unavailable. Please try again.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("goes Home on Not now, without saving", () => {
    render(<PickGoal saved={null} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(screen.getByRole("link", { name: "Not now" }).getAttribute("href")).toBe("/home");
    expect(screen.queryByRole("button", { name: "Remove my goal" })).toBeNull();
  });

  const LAPTOP: Goal = {
    preset: "other",
    name: "Laptop",
    amountCents: 90_050,
    targetDate: "2027-08-01",
    dateChosen: true,
    monthlyCents: 11_257,
    acceptedMonthlyCents: 11_257,
    updatedAt: "2026-11-26T15:00:00.000Z",
  };

  it("brings a saved goal back filled in, behind More goals", () => {
    render(<PickGoal saved={LAPTOP} setAsideCents={11_257} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(goals().getByRole("button", { name: "Something else" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("What is it for?") as HTMLInputElement).value).toBe("Laptop");
    expect(amount().value).toBe("900.50");
    expect(date().value).toBe("2027-08-01");
  });

  it("asks before removing, saying the plan's set-aside stops too, then removes and goes Home", async () => {
    deleteGoal.mockResolvedValue({ kind: "ok", data: { setAsideCleared: true } });
    render(<PickGoal saved={LAPTOP} setAsideCents={11_257} today={TODAY} suggestions={SUGGESTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove my goal" }));
    expect(deleteGoal).not.toHaveBeenCalled();
    expect(screen.getByText("Remove your goal? Your $112.57 a month set-aside stops too.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep my goal" }));
    expect(screen.queryByText(/Remove your goal\?/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove my goal" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(deleteGoal).toHaveBeenCalledTimes(1);
  });

  // Home's next step "Start your emergency fund" opens ?preset=emergency_fund.
  it("starts with a goal picked and its suggestion filled in, over another saved goal", () => {
    const { unmount } = render(<PickGoal saved={null} preselect="emergency_fund" setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(goals().getByRole("button", { name: "Emergency fund" }).getAttribute("aria-pressed")).toBe("true");
    expect(amount().value).toBe("1240");
    expect(date().value).toBe("");
    unmount();
    render(<PickGoal saved={LAPTOP} preselect="emergency_fund" setAsideCents={11_257} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(goals().getByRole("button", { name: "Emergency fund" }).getAttribute("aria-pressed")).toBe("true");
    expect(goals().getAllByRole("button", { pressed: true }).map((button) => button.textContent)).toEqual(["Emergency fund"]);
    expect(amount().value).toBe("1240");
    expect(date().value).toBe("");
  });

  it("keeps the saved goal as it was when it is the one asked for", () => {
    const saved: Goal = { ...LAPTOP, preset: "emergency_fund", name: "Emergency fund", amountCents: 200_000 };
    render(<PickGoal saved={saved} preselect="emergency_fund" setAsideCents={11_257} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(amount().value).toBe("2000");
    expect(date().value).toBe("2027-08-01");
  });

  it("says a set-aside the student changed since stays, and where to change it", () => {
    render(<PickGoal saved={LAPTOP} setAsideCents={5_000} today={TODAY} suggestions={SUGGESTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove my goal" }));
    expect(screen.getByText("Remove your goal? Your $50 a month set-aside stays; change it on Your money.")).toBeTruthy();
  });

  it("asks plainly when there is no set-aside", () => {
    render(<PickGoal saved={{ ...LAPTOP, acceptedMonthlyCents: null }} setAsideCents={0} today={TODAY} suggestions={SUGGESTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove my goal" }));
    expect(screen.getByText("Remove your goal?")).toBeTruthy();
  });
});
