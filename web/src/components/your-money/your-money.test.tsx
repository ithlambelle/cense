// @vitest-environment jsdom
// Created with Claude Code (2026-11-13). Your money's two tabs, the short
// state and Accounts, as a student sees them.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
const track = vi.fn();
vi.mock("@/lib/analytics", async (original) => ({ ...(await original<typeof import("@/lib/analytics")>()), track: (...args: unknown[]) => track(...args) }));
const saveSafeToSpendAnswers = vi.fn();
const refreshBank = vi.fn();
vi.mock("@/lib/api-client/safe-to-spend", async (original) => ({
  ...(await original<typeof import("@/lib/api-client/safe-to-spend")>()),
  saveSafeToSpendAnswers: (...args: unknown[]) => saveSafeToSpendAnswers(...args),
  refreshBank: (...args: unknown[]) => refreshBank(...args),
}));
const saveBudgetLine = vi.fn();
vi.mock("@/lib/api-client/budget", () => ({ saveBudgetLine: (...args: unknown[]) => saveBudgetLine(...args) }));

import type { Budget } from "@/lib/api/budget";
import type { SafeToSpendData } from "@/lib/api-client/safe-to-spend";
import { EDUCATIONAL_DISCLAIMER } from "@/lib/budget/copy";
import { buildBudgetLines, summarize } from "@/lib/budget/lines";

import { AccountsView, accountKinds } from "./accounts-view";
import { YourMoneyView } from "./your-money-view";

// The frame's numbers (709:1520): $2,100 checking, $240 on the card, rent
// $650 due the 15th, phone $40 due the 12th, $100 aside: $1,070, $35 a day.
const DATA: SafeToSpendData = {
  institutionName: "First Platypus Bank",
  status: "active",
  linkedAt: "2026-11-01T12:00:00.000Z",
  refreshedAt: "2026-11-03T20:10:00.000Z",
  answered: true,
  accounts: [
    { name: "Plaid Checking", mask: "0000", kind: "cash", balanceCents: 210000 },
    { name: "Plaid Credit Card", mask: "3333", kind: "card", balanceCents: 24000 },
  ],
  bills: [
    { bill: "rent", coveredBy: "me", monthlyCents: 65000, dueDay: 15 },
    { bill: "phone", coveredBy: "me", monthlyCents: 4000, dueDay: 12 },
    { bill: "tuition", coveredBy: "family", monthlyCents: null, dueDay: null },
    { bill: "groceries", coveredBy: "none", monthlyCents: null, dueDay: null },
    { bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null },
  ],
  setAsideCents: 10000,
  cashCents: 210000,
  cardCents: 24000,
  billsCents: 69000,
  leftCents: 107000,
  days: 30,
  dailyCents: 3566,
};

const row = (category: string | null, categoryDetailed: string | null, outCents: number) => ({ category, categoryDetailed, outCents, inCents: 0 });

function budget(overrides: Partial<Parameters<typeof buildBudgetLines>[0]> = {}): Budget {
  const lines = buildBudgetLines({
    month: "2026-10-01",
    incomeCents: 208000,
    totals: [
      row("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", 70000),
      row("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", 30000),
      row("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", 20000),
    ],
    typed: {},
    setAsideCents: 10000,
    hasBankData: true,
    ...overrides,
  });
  return { ...lines, ...summarize(lines) } as unknown as Budget;
}

const hero = () => screen.getAllByRole("region")[0];
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const commit = async (label: string) => {
  await act(async () => {
    fireEvent.blur(screen.getByLabelText(label));
  });
};

// Ben, 2026-10-30: the app informs and never tells a student what to do.
// From draft PR #86's test, extended to every Your money screen.
const ADVICE = /\b(should|recommend\w*|you may want|you might want|consider|try to|we suggest|i suggest|you need to|you must|cut back|pull back)\b/i;

beforeEach(() => {
  saveSafeToSpendAnswers.mockResolvedValue({ kind: "ok", data: DATA });
  saveBudgetLine.mockResolvedValue({ kind: "ok", data: {} });
  refreshBank.mockResolvedValue({ kind: "ok", data: DATA });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Your money, Today (709:1520)", () => {
  it("shows how the daily number adds up, from the bank and from the student", () => {
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} />);
    expect(hero().textContent).toContain("Safe to spend today:");
    expect(hero().textContent).toContain("$35.66 a day");
    expect(screen.getByRole("link", { name: "Today" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "This month" }).getAttribute("href")).toBe("/safe-to-spend?tab=month");
    const bank = within(screen.getByRole("list", { name: "From your bank" }));
    expect(bank.getByText("Cash in checking").parentElement!.textContent).toBe("Cash in checking$2,100");
    expect(bank.getByText("Card balances").parentElement!.textContent).toBe("Card balances−$240");
    expect(screen.getByText("You cover it · due the 15th")).toBeTruthy();
    expect((screen.getByLabelText("Rent each month") as HTMLInputElement).value).toBe("650");
    expect((screen.getByLabelText("Set aside each month") as HTMLInputElement).value).toBe("100");
    expect(screen.getByText("Left for 30 days · $35.66 a day").parentElement!.textContent).toContain("$1,070");
    expect(track).toHaveBeenCalledWith("your_money_viewed", { tab: "today" });
  });

  it("leaves bank rows read only and has no Disconnect here", () => {
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} />);
    expect(screen.queryByRole("textbox", { name: /checking|card balances/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /disconnect/i })).toBeNull();
  });

  it("updates the sum as the student types, then saves the same answers as Change your answers", async () => {
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} />);
    type("Rent each month", "700");
    expect(screen.getByText(/Left for 30 days/).parentElement!.textContent).toContain("$1,020");
    await commit("Rent each month");
    expect(saveSafeToSpendAnswers).toHaveBeenCalledWith({
      bills: [{ ...DATA.bills[0], monthlyCents: 70000 }, ...DATA.bills.slice(1)],
      setAsideCents: 10000,
    });
    expect(track).toHaveBeenCalledWith("money_amount_saved", { tab: "today", line: "bill" });
    expect(refresh).toHaveBeenCalled();
  });

  it("refuses text that is not an amount and saves nothing", async () => {
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} />);
    type("Set aside each month", "a lot");
    await commit("Set aside each month");
    expect(screen.getByRole("alert").textContent).toBe("Use an amount like 25 or 25.50.");
    expect(screen.getByLabelText("Set aside each month").getAttribute("aria-invalid")).toBe("true");
    expect(saveSafeToSpendAnswers).not.toHaveBeenCalled();
  });

  it("does not save when nothing changed", async () => {
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} />);
    await commit("Rent each month");
    expect(saveSafeToSpendAnswers).not.toHaveBeenCalled();
  });

  it("keeps the typed value and says so when the save fails", async () => {
    saveSafeToSpendAnswers.mockResolvedValue({ kind: "failed", code: null, message: "Check your connection and try again." });
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} />);
    type("Rent each month", "700");
    await commit("Rent each month");
    expect(screen.getByRole("alert").textContent).toBe("Check your connection and try again.");
    expect((screen.getByLabelText("Rent each month") as HTMLInputElement).value).toBe("700");
  });

  it("says a bill whose day has passed is done this month", () => {
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={20} />);
    expect(screen.getByText("You cover it · due the 15th, done this month")).toBeTruthy();
  });

  it("sends a broken bank link to Accounts instead of showing a number", () => {
    render(<YourMoneyView tab="today" data={{ ...DATA, status: "reconnect_needed" }} budget={null} today={5} />);
    expect(hero().textContent).not.toContain("a day");
    expect(screen.getByRole("link", { name: "Reconnect your bank" }).getAttribute("href")).toBe("/settings/accounts");
  });
});

describe("Your money, This month (709:1769)", () => {
  it("lists income, needs, wants and saving, with what is left over", () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />);
    // 2,080 - 700 - 300 - 200 - 100 = 780
    expect(hero().textContent).toContain("Left over each month:");
    expect(hero().textContent).toContain("$780");
    expect(hero().textContent).toContain("After needs, wants and saving");
    expect(screen.getByRole("link", { name: "This month" }).getAttribute("aria-current")).toBe("page");
    expect(within(screen.getByRole("list", { name: "Needs" })).getAllByRole("textbox").map((field) => field.getAttribute("aria-label"))).toEqual([
      "Rent and bills each month",
      "Groceries each month",
    ]);
    expect(within(screen.getByRole("list", { name: "Wants" })).getByLabelText("Eating out each month")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Saving" })).getByText("You typed")).toBeTruthy();
    expect((screen.getByLabelText("Income each month") as HTMLInputElement).value).toBe("2080");
    expect(screen.getByText("Bank numbers are from October.")).toBeTruthy();
    expect(screen.getByText(EDUCATIONAL_DISCLAIMER)).toBeTruthy();
    expect(track).toHaveBeenCalledWith("your_money_viewed", { tab: "this_month" });
  });

  it("updates the total as the student types, and saves a line as the student's own", async () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />);
    type("Eating out each month", "100");
    expect(hero().textContent).toContain("$880");
    await commit("Eating out each month");
    expect(saveBudgetLine).toHaveBeenCalledWith("eating_out", 10000);
    expect(track).toHaveBeenCalledWith("money_amount_saved", { tab: "this_month", line: "want" });
  });

  it("saves the saving line as the set-aside, with the bill answers unchanged", async () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />);
    type("Set aside each month", "150");
    await commit("Set aside each month");
    expect(saveSafeToSpendAnswers).toHaveBeenCalledWith({ bills: DATA.bills, setAsideCents: 15000 });
    expect(saveBudgetLine).not.toHaveBeenCalled();
  });

  it("marks a line the student typed", () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget({ typed: { groceries: 25000 } })} today={5} />);
    const groceries = screen.getByLabelText("Groceries each month").closest("li")!;
    expect(groceries.textContent).toContain("You typed");
  });

  it("counts an empty field as $0 without flagging it", () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />);
    type("Eating out each month", "");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(hero().textContent).toContain("$980");
  });

  it("says None seen for a month with no income", () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget({ incomeCents: null })} today={5} />);
    expect(screen.getByText("None seen in October")).toBeTruthy();
  });

  it("waits for the bank's transactions without showing a total", () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget({ incomeCents: null, totals: [], hasBankData: false })} today={5} />);
    expect(hero().textContent).toContain("Not yet");
    expect(hero().textContent).toContain("No transactions from your bank yet");
    expect(screen.queryByText(/Bank numbers are from/)).toBeNull();
    expect(screen.getByText(EDUCATIONAL_DISCLAIMER)).toBeTruthy();
  });
});

describe("Your money, Short (709:1865)", () => {
  it("says what it is short by in one plain line when wants and saving pass income", () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />);
    type("Eating out each month", "1000");
    expect(hero().textContent).toContain("Short each month by:");
    // 2,080 - 700 - 300 - 1,000 - 100 = -20
    expect(hero().textContent).toContain("$20");
    expect(hero().textContent).not.toContain("-$");
    // Only wants and saving passed income, so it does not blame fixed costs.
    expect(hero().textContent).toContain("After needs, wants and saving");
  });

  it("says needs and fixed wants are more than income only when they are", () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />);
    type("Rent and bills each month", "2000");
    expect(hero().textContent).toContain("Short each month by:");
    expect(hero().textContent).toContain("Needs and fixed wants are more than income");
  });
});

describe("Accounts (709:1609) and the disconnect sheet (709:1664)", () => {
  it("names the bank's accounts and has Refresh now, Change your answers and Disconnect bank", () => {
    render(<AccountsView data={DATA} />);
    expect(screen.getByRole("heading", { level: 1, name: "Accounts" })).toBeTruthy();
    expect(screen.getByText("First Platypus Bank")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Change your answers/ }).getAttribute("href")).toBe("/safe-to-spend/setup");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect bank" }));
    const sheet = screen.getByRole("dialog", { name: "Disconnect your bank?" });
    expect(within(sheet).getByRole("button", { name: "Disconnect" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Keep it" })).toBeTruthy();
    expect(sheet.textContent).toContain("If Plaid is down, nothing changes.");
  });

  it("says which kinds of account the bank shared", () => {
    expect(accountKinds(DATA)).toBe("Checking and credit card");
    expect(accountKinds({ accounts: [...DATA.accounts, { name: "S", mask: null, kind: "other", balanceCents: 1 }] })).toBe("Checking, savings and credit card");
    expect(accountKinds({ accounts: [] })).toBe("");
  });

  it("refreshes the bank from Refresh now", async () => {
    render(<AccountsView data={DATA} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    });
    expect(refreshBank).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });
});

describe("words", () => {
  it("never tells a student what to do, on Today, This month, Short, errors or Accounts", async () => {
    const screens = [
      () => render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} />),
      () => render(<YourMoneyView tab="today" data={{ ...DATA, status: "relink_needed" }} budget={null} today={20} />),
      () => render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />),
      () => render(<YourMoneyView tab="month" data={DATA} budget={budget({ incomeCents: null, totals: [], hasBankData: false })} today={5} />),
      () => render(<AccountsView data={DATA} />),
    ];
    for (const show of screens) {
      show();
      expect(document.body.textContent).not.toMatch(ADVICE);
      cleanup();
    }
    render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />);
    type("Rent and bills each month", "5000");
    type("Groceries each month", "not an amount");
    await commit("Groceries each month");
    expect(document.body.textContent).not.toMatch(ADVICE);
    cleanup();
    render(<AccountsView data={DATA} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect bank" }));
    expect(document.body.textContent).not.toMatch(ADVICE);
  });

  it("uses no em dashes or tildes", () => {
    render(<YourMoneyView tab="month" data={DATA} budget={budget()} today={5} />);
    expect(document.body.textContent).not.toMatch(/[—~]/);
    cleanup();
    render(<YourMoneyView tab="today" data={DATA} budget={null} today={5} />);
    expect(document.body.textContent).not.toMatch(/[—~]/);
  });
});
