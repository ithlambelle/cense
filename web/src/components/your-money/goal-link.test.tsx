// @vitest-environment jsdom
// Created with Claude Code (2026-11-26). The Savings goal line on Your money
// leads to the goal: Set a goal, or Change goal once there is one.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import type { SafeToSpendData } from "@/lib/api-client/safe-to-spend";

import { YourMoneyView } from "./your-money-view";

const DATA: SafeToSpendData = {
  institutionName: "First Platypus Bank",
  status: "active",
  linkedAt: "2026-11-01T12:00:00.000Z",
  refreshedAt: "2026-11-03T20:10:00.000Z",
  answered: true,
  accounts: [{ name: "Plaid Checking", mask: "0000", kind: "cash", balanceCents: 210000 }],
  bills: [
    { bill: "rent", coveredBy: "me", monthlyCents: 65000, dueDay: 15 },
    { bill: "phone", coveredBy: "none", monthlyCents: null, dueDay: null },
    { bill: "tuition", coveredBy: "none", monthlyCents: null, dueDay: null },
    { bill: "groceries", coveredBy: "none", monthlyCents: null, dueDay: null },
    { bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null },
  ],
  setAsideCents: 16667,
  cashCents: 210000,
  cardCents: 0,
  billsCents: 65000,
  leftCents: 128333,
  days: 30,
  dailyCents: 4277,
};

const savingsRow = () => screen.getByLabelText("Savings goal").closest("li") as HTMLElement;

describe("Your money's Savings goal line", () => {
  it("offers Set a goal when there is none", () => {
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} hasGoal={false} />);
    expect(within(savingsRow()).getByRole("link", { name: "Set a goal" }).getAttribute("href")).toBe("/start/goal");
  });

  it("offers Change goal once there is one", () => {
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} hasGoal />);
    expect(within(savingsRow()).getByRole("link", { name: "Change goal" }).getAttribute("href")).toBe("/start/goal");
  });
});
