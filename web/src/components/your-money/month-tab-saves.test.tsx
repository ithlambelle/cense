// @vitest-environment jsdom
// Created with Claude Code (2026-11-14): This month saves and undo, from the
// review of the Your money branch (an edit typed during an undo was dropped;
// a failed save's message outlived the next good save).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/analytics", async (original) => ({ ...(await original<typeof import("@/lib/analytics")>()), track: () => {} }));
const saveSafeToSpendAnswers = vi.fn();
vi.mock("@/lib/api-client/safe-to-spend", async (original) => ({
  ...(await original<typeof import("@/lib/api-client/safe-to-spend")>()),
  saveSafeToSpendAnswers: (...args: unknown[]) => saveSafeToSpendAnswers(...args),
}));
const saveBudgetLine = vi.fn();
const deleteBudgetLine = vi.fn();
vi.mock("@/lib/api-client/budget", () => ({
  saveBudgetLine: (...args: unknown[]) => saveBudgetLine(...args),
  deleteBudgetLine: (...args: unknown[]) => deleteBudgetLine(...args),
}));

import type { Budget } from "@/lib/api/budget";
import { buildBudgetLines, summarize } from "@/lib/budget/lines";
import { YourMoneyView } from "@/components/your-money/your-money-view";

const DATA = {
  institutionName: "First Platypus Bank", status: "active", linkedAt: "2026-11-01T12:00:00.000Z", refreshedAt: null, answered: true,
  accounts: [], bills: [], setAsideCents: 10000, cashCents: 0, cardCents: 0, billsCents: 0, leftCents: 0, days: 30, dailyCents: 0,
} as unknown as Parameters<typeof YourMoneyView>[0]["data"];
function budget(typed: Record<string, number>): Budget {
  const lines = buildBudgetLines({ month: "2026-10-01", incomeCents: 208000,
    totals: [{ category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_GROCERIES", outCents: 30000, inCents: 0 }],
    typed, setAsideCents: 10000, hasBankData: true });
  return { ...lines, ...summarize(lines) } as unknown as Budget;
}
const input = () => screen.getByLabelText("Groceries each month") as HTMLInputElement;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("an edit typed while the undo is on its way is kept", async () => {
  let finishUndo: (v: unknown) => void = () => {};
  deleteBudgetLine.mockImplementationOnce(() => new Promise((r) => (finishUndo = r)));
  saveBudgetLine.mockResolvedValue({ kind: "ok", data: {} });
  render(<YourMoneyView tab="month" data={DATA} budget={budget({ groceries: 25000 })} today={5} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use the bank's number for Groceries" })); });
  fireEvent.change(input(), { target: { value: "500" } });
  await act(async () => { fireEvent.blur(input()); });
  await act(async () => finishUndo({ kind: "ok", data: {} }));
  await act(async () => {});
  expect({ field: input().value, calls: saveBudgetLine.mock.calls }).toEqual({ field: "500", calls: [["groceries", 50000]] });
});

it("a failed first save's error is cleared once the second save succeeds", async () => {
  let failFirst: (v: unknown) => void = () => {};
  saveBudgetLine.mockImplementationOnce(() => new Promise((r) => (failFirst = r))).mockResolvedValue({ kind: "ok", data: {} });
  render(<YourMoneyView tab="month" data={DATA} budget={budget({})} today={5} />);
  fireEvent.change(input(), { target: { value: "400" } });
  await act(async () => { fireEvent.blur(input()); });
  fireEvent.change(input(), { target: { value: "450" } });
  await act(async () => { fireEvent.blur(input()); });
  await act(async () => failFirst({ kind: "failed", code: null, message: "Check your connection and try again." }));
  await act(async () => {});
  expect({ calls: saveBudgetLine.mock.calls, alert: screen.queryByRole("alert")?.textContent ?? null }).toEqual({ calls: [["groceries", 40000], ["groceries", 45000]], alert: null });
});
