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
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
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
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
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
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
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

  it("asks what Something else is for", () => {
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "More goals" }));
    choose("Something else");
    fireEvent.change(amount(), { target: { value: "400" } });
    submit();
    expect(screen.getByText("Say what it’s for.")).toBeTruthy();
    expect(saveGoal).not.toHaveBeenCalled();
  });

  it("refuses a date that is not after today, or too far out", () => {
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
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
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Emergency fund");
    submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/start/plan"));
    expect(saveGoal).toHaveBeenCalledWith({ preset: "emergency_fund", name: "Emergency fund", amountCents: 124_000, targetDate: null });
    expect(track).toHaveBeenCalledWith("goal_saved", { preset: "emergency_fund", amount: "suggested", dated: false });
  });

  it("saves a typed amount and a date, and counts it as typed", async () => {
    saveGoal.mockResolvedValue({ kind: "ok", data: { goal: {} } });
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
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
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
    choose("Emergency fund");
    submit();
    expect(await screen.findByText("Your data is temporarily unavailable. Please try again.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("goes Home on Not now, without saving", () => {
    render(<PickGoal saved={null} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(screen.getByRole("link", { name: "Not now" }).getAttribute("href")).toBe("/home");
    expect(screen.queryByRole("button", { name: "Remove my goal" })).toBeNull();
  });

  it("brings a saved goal back filled in, behind More goals, and can remove it", async () => {
    const saved: Goal = {
      preset: "other",
      name: "Laptop",
      amountCents: 90_050,
      targetDate: "2027-08-01",
      plan: { months: 8, monthlyCents: 11_257, byDate: "2027-08-01" },
      updatedAt: "2026-11-26T15:00:00.000Z",
    };
    deleteGoal.mockResolvedValue({ kind: "ok", data: null });
    render(<PickGoal saved={saved} today={TODAY} suggestions={SUGGESTIONS} />);
    expect(goals().getByRole("button", { name: "Something else" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("What is it for?") as HTMLInputElement).value).toBe("Laptop");
    expect(amount().value).toBe("900.50");
    expect(date().value).toBe("2027-08-01");
    fireEvent.click(screen.getByRole("button", { name: "Remove my goal" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(deleteGoal).toHaveBeenCalledTimes(1);
  });
});
