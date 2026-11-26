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
  readBankFindings.mockResolvedValue({ kind: "ok", data: { findings: FINDINGS, answeredFromBank: true, enoughHistory: true, safeToSpend: { answered: true }, lastMonth } });

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

  it("still goes Home when the check cannot be saved: it is only a note for Home, and it is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    found();
    markBudgetChecked.mockResolvedValue({ kind: "failed", code: "data_unavailable", message: "Something went wrong. Please try again." });
    render(<ReadingView />);
    fireEvent.click(await finished());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("budget_check_save_failed"));
    warn.mockRestore();
  });

  it("adds the set-aside, so the lines add up to what is left over", async () => {
    found({ ...BUDGET, saving: line("Savings goal", "saving", 10_000), remainingCents: 89_500 });
    render(<ReadingView />);
    await finished();
    expect(within(screen.getByRole("region", { name: "Here’s October" })).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Money in$2,100",
      "Needs$925",
      "Wants$180",
      "Savings goal$100",
      "Left over$895",
    ]);
  });
});

describe("ReadingView, when the bank cannot be answered from", () => {
  it("sends a student whose bank has sent too little history to the questions, with no findings and no Looks right", async () => {
    readBankFindings.mockResolvedValue({ kind: "ok", data: { findings: [], answeredFromBank: false, enoughHistory: false, safeToSpend: { answered: false }, lastMonth: null } });
    render(<ReadingView />);
    expect(await screen.findByRole("heading", { level: 1, name: "Your bank is still catching up" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Answer a few questions" }).getAttribute("href")).toBe("/safe-to-spend/setup");
    expect(screen.queryByRole("list", { name: "What we found" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Looks right" })).toBeNull();
    expect(screen.getByRole("main").getAttribute("aria-busy")).toBe("false");
  });

  it("still shows a student who already answered what was found, even with a short history", async () => {
    readBankFindings.mockResolvedValue({ kind: "ok", data: { findings: FINDINGS, answeredFromBank: false, enoughHistory: false, safeToSpend: { answered: true }, lastMonth: null } });
    render(<ReadingView />);
    await finished();
    expect(screen.getByRole("list", { name: "What we found" })).toBeTruthy();
  });

  it("says the read failed in the heading, not that it is still reading, and is no longer busy", async () => {
    readBankFindings.mockResolvedValue({ kind: "failed", code: "data_unavailable", message: "Something went wrong. Please try again." });
    render(<ReadingView />);
    expect(await screen.findByRole("heading", { level: 1, name: "We couldn’t read your bank" })).toBeTruthy();
    expect(screen.getByRole("main").getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows every row at once to a student who asked for less motion", async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    found();
    render(<ReadingView />);
    expect(await screen.findByRole("button", { name: "Looks right" }, { timeout: 300 })).toBeTruthy();
    window.matchMedia = matchMedia;
  });
});
