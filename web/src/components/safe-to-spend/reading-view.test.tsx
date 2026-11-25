// @vitest-environment jsdom
// Created with Claude Code (2026-11-25). Penny reading the bank (step L1),
// then "Looks right?" (step 3): last month in totals, Looks right saved before
// Home, Fix something to the questions.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
const readBankFindings = vi.fn();
const markBudgetChecked = vi.fn();
vi.mock("@/lib/api-client/safe-to-spend", () => ({
  readBankFindings: (...args: unknown[]) => readBankFindings(...args),
  markBudgetChecked: (...args: unknown[]) => markBudgetChecked(...args),
}));

import { ReadingView } from "./reading-view";

const line = (key: string, group: string, amountCents: number) => ({ key, label: key, group, amountCents, bankCents: amountCents, typed: false, recurrence: null });
const BUDGET = {
  month: "2026-10-01",
  hasBankData: true,
  income: line("income", "income", 210_000),
  needs: [line("rent", "need", 65_000), line("groceries", "need", 27_500)],
  wants: [line("restaurants", "want", 18_000)],
  saving: line("saving", "saving", 0),
  remainingCents: 99_500,
  shortfallCents: 0,
  fixedOverIncome: false,
};
const FINDINGS = [
  { key: "rent", kind: "rent", title: "Rent", detail: "$650 on the 6th", found: true },
  { key: "phone", kind: "phone", title: "Phone", detail: "", found: false },
];
const found = (lastMonth: unknown = BUDGET) =>
  readBankFindings.mockResolvedValue({ kind: "ok", data: { findings: FINDINGS, answeredFromBank: true, safeToSpend: {}, lastMonth } });

// The rows land one by one; the buttons come once every row has.
const finished = () => screen.findByRole("button", { name: "Looks right" }, { timeout: 5000 });

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReadingView, Looks right?", () => {
  it("shows last month in four lines, masked for session replay, and asks Looks right?", async () => {
    found();
    render(<ReadingView />);
    await finished();
    const month = screen.getByRole("region", { name: "Here’s October" });
    expect(within(month).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Money in$2,100",
      "Needs$925",
      "Wants$180",
      "Left over$995",
    ]);
    for (const amount of within(month).getAllByText(/^\$/)) expect(amount.className).toContain("ph-sensitive");
    expect(screen.getByRole("heading", { level: 2, name: "Looks right?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Fix something" }).getAttribute("href")).toBe("/safe-to-spend/setup");
  });

  it("says Short when last month cost more than came in", async () => {
    found({ ...BUDGET, remainingCents: 0, shortfallCents: 12_000 });
    render(<ReadingView />);
    await finished();
    expect(within(screen.getByRole("region", { name: "Here’s October" })).getByText("Short").nextSibling?.textContent).toBe("$120");
  });

  it("leaves last month out when the bank has sent nothing yet, or it could not be read", async () => {
    found({ ...BUDGET, hasBankData: false });
    const { unmount } = render(<ReadingView />);
    await finished();
    expect(screen.queryByRole("region", { name: /Here’s/ })).toBeNull();
    unmount();
    found(null);
    render(<ReadingView />);
    await finished();
    expect(screen.queryByRole("region", { name: /Here’s/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Looks right?" })).toBeTruthy();
  });

  it("saves the check before going Home", async () => {
    found();
    markBudgetChecked.mockResolvedValue({ kind: "ok", data: undefined });
    render(<ReadingView />);
    fireEvent.click(await finished());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(markBudgetChecked).toHaveBeenCalledTimes(1);
  });

  it("stays on the screen and says so when the check cannot be saved", async () => {
    found();
    markBudgetChecked.mockResolvedValue({ kind: "failed", code: "data_unavailable", message: "Something went wrong. Please try again." });
    render(<ReadingView />);
    fireEvent.click(await finished());
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Looks right" })).toBeTruthy();
  });
});
