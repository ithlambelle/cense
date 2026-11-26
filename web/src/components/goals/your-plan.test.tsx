// @vitest-environment jsdom
// Created with Claude Code (2026-11-26). Your plan: the month in four lines,
// Accept saves the set-aside with the student's bills unchanged, then Home.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
const saveSafeToSpendAnswers = vi.fn();
vi.mock("@/lib/api-client/safe-to-spend", () => ({ saveSafeToSpendAnswers: (...args: unknown[]) => saveSafeToSpendAnswers(...args) }));
const acceptGoalPlan = vi.fn();
vi.mock("@/lib/api-client/goals", () => ({ acceptGoalPlan: (...args: unknown[]) => acceptGoalPlan(...args) }));
const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ SENSITIVE: "ph-sensitive", track: (...args: unknown[]) => track(...args) }));

import type { Goal } from "@/lib/api/goals";
import type { BillAnswer } from "@/lib/api-client/safe-to-spend";
import { planSummary } from "@/lib/goals/plan";

import { YourPlan } from "./your-plan";

const GOAL: Goal = {
  preset: "emergency_fund",
  name: "Emergency fund",
  amountCents: 124_000,
  targetDate: "2027-05-26",
  monthlyCents: 20_667,
  acceptedMonthlyCents: null,
  updatedAt: "2026-11-26T15:00:00.000Z",
};
const BILLS: BillAnswer[] = [
  { bill: "rent", coveredBy: "me", monthlyCents: 65_000, dueDay: 6 },
  { bill: "phone", coveredBy: "none", monthlyCents: null, dueDay: null },
  { bill: "tuition", coveredBy: "none", monthlyCents: null, dueDay: null },
  { bill: "groceries", coveredBy: "me", monthlyCents: 27_500, dueDay: 31 },
  { bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null },
];

function show({ goal = GOAL, income = 210_000 as number | null, previous = 0 } = {}) {
  render(
    <YourPlan
      goal={goal}
      previousSetAsideCents={previous}
      summary={planSummary({ incomeCents: income, bills: BILLS, setAsideCents: goal.monthlyCents })}
    />,
  );
}
const rows = () => within(screen.getByRole("region", { name: "Each month" })).getAllByRole("listitem").map((row) => row.textContent);

afterEach(() => {
  vi.clearAllMocks();
});

describe("YourPlan", () => {
  it("names the goal and its date, and shows the month in four lines", () => {
    show();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your plan");
    expect(screen.getByText("Emergency fund: $1,240 by May 26, 2027")).toBeTruthy();
    expect(rows()).toEqual(["Money in$2,100", "Bills$925", "Set aside for your goal$206.67", "Left for everything else$968.33"]);
  });

  it("says Short when the plan is more than comes in, and leaves money in out when there is none", () => {
    show({ income: 100_000 });
    expect(rows().at(-1)).toBe("Short$131.67");
    window.document.body.innerHTML = "";
    show({ income: null });
    expect(rows()).toEqual(["Bills$925", "Set aside for your goal$206.67"]);
  });

  it("says when it replaces an amount the student set aside before", () => {
    show({ previous: 5_000 });
    expect(screen.getByText("This replaces the $50 you set aside before.")).toBeTruthy();
  });

  it("saves only the set-aside, never the bills loaded with the page, then goes Home", async () => {
    acceptGoalPlan.mockResolvedValue({ kind: "ok", data: null });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Accept plan" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(acceptGoalPlan).toHaveBeenCalledTimes(1);
    expect(saveSafeToSpendAnswers).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("goal_plan_saved", { preset: "emergency_fund" });
  });

  it("saves once on a double tap", async () => {
    let finish: (value: unknown) => void = () => {};
    acceptGoalPlan.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    show();
    const accept = screen.getByRole("button", { name: "Accept plan" });
    fireEvent.click(accept);
    fireEvent.click(accept);
    finish({ kind: "ok", data: null });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(acceptGoalPlan).toHaveBeenCalledTimes(1);
  });

  it("says why a save failed and stays", async () => {
    acceptGoalPlan.mockResolvedValue({ kind: "failed", code: "data_unavailable", message: "Your data is temporarily unavailable. Please try again." });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Accept plan" }));
    expect(await screen.findByText("Your data is temporarily unavailable. Please try again.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("will not accept a set-aside over $100,000 a month", () => {
    show({ goal: { ...GOAL, amountCents: 100_000_000, targetDate: "2026-12-26", monthlyCents: 100_000_000 } });
    expect(screen.getByText(/more than you can set aside in a month/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept plan" }));
    expect(acceptGoalPlan).not.toHaveBeenCalled();
  });

  it("goes back to Pick a goal from Edit and from the back arrow", () => {
    show();
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/start/goal");
    expect(screen.getByRole("link", { name: "Back to Pick a goal" }).getAttribute("href")).toBe("/start/goal");
  });
});
