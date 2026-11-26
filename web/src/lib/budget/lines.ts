// Created with Claude Code (2026-11-13). The lines of Your money's This month
// tab (Figma 709:1769, 709:1865), from the student's stored transactions and
// the numbers they typed, and the total at the top. Pure, shared by the server
// and the screen, which recomputes as the student types.
//
// - Income: the last full calendar month's income (income_by_month).
// - Needs and wants: one line per Cense category with spending in that month
//   (categories.ts), plus any line the student typed a number for.
// - Saving: the safe-to-spend set-aside, which the student typed.
// A typed number replaces the bank's for that line; untyped lines follow the
// bank. The arithmetic is draft PR #86's waterfall (budget.ts).

import { computeBudget, type BudgetResult, type Expense, type Recurrence } from "./budget";
import { BUDGET_CATEGORIES, spendingByCategory, type CategoryKey, type DetailedTotal } from "./categories";

export type LineKey = "income" | CategoryKey;
export type LineGroup = "income" | "need" | "want" | "saving";

export type BudgetLine = {
  key: LineKey | "saving";
  label: string;
  group: LineGroup;
  amountCents: number;
  // The bank's number for the line, null for a line the bank has nothing for
  // (and for saving, which is always typed).
  bankCents: number | null;
  typed: boolean;
  // "Fixed" or "Changing" once the recurring detector (#109) says which.
  // Null until then; the #86 math counts a want with no recurrence as changing.
  recurrence: Recurrence | null;
};

export type BudgetLines = {
  // The month the bank numbers are from, YYYY-MM-01.
  month: string;
  // False when nothing from the bank has arrived for the last three months:
  // transactions not synced yet.
  hasBankData: boolean;
  income: BudgetLine;
  needs: BudgetLine[];
  wants: BudgetLine[];
  saving: BudgetLine;
};

export type BudgetSummary = {
  // What is left each month; below zero when short.
  remainingCents: number;
  shortfallCents: number;
  // True only when needs and fixed wants alone are more than income.
  fixedOverIncome: boolean;
};

export const SAVING_LABEL = "Saving";

export function buildBudgetLines({
  month,
  incomeCents,
  totals,
  typed,
  setAsideCents,
  hasBankData,
}: {
  month: string;
  // null when the month had no income
  incomeCents: number | null;
  totals: DetailedTotal[];
  typed: Partial<Record<LineKey, number>>;
  setAsideCents: number;
  hasBankData: boolean;
}): BudgetLines {
  const spent = spendingByCategory(totals);
  const line = (key: LineKey, label: string, group: LineGroup, bankCents: number | null): BudgetLine => ({
    key,
    label,
    group,
    bankCents,
    typed: typed[key] !== undefined,
    amountCents: typed[key] ?? bankCents ?? 0,
    recurrence: null,
  });
  const categoryLines = BUDGET_CATEGORIES.filter((category) => spent[category.key] !== undefined || typed[category.key] !== undefined).map(
    (category) => line(category.key, category.label, category.group, spent[category.key] ?? null),
  );
  return {
    month,
    hasBankData,
    income: line("income", "Income", "income", incomeCents),
    needs: categoryLines.filter((entry) => entry.group === "need"),
    wants: categoryLines.filter((entry) => entry.group === "want"),
    saving: {
      key: "saving",
      label: SAVING_LABEL,
      group: "saving",
      bankCents: null,
      typed: true,
      amountCents: setAsideCents,
      recurrence: null,
    },
  };
}

// The total, with `amounts` (the fields as the student is typing them) over
// the saved ones. Lines are a month each, so income is "monthly".
export function summarize(lines: BudgetLines, amounts: Partial<Record<string, number>> = {}): BudgetSummary {
  const amount = (entry: BudgetLine) => amounts[entry.key] ?? entry.amountCents;
  const expense = (entry: BudgetLine): Expense => ({
    id: entry.key,
    label: entry.label,
    necessity: entry.group === "need" ? "need" : "want",
    // Needs count before the surplus whichever they are; a want counts there
    // only when it is known to be fixed.
    recurrence: entry.recurrence ?? "variable",
    monthlyCents: amount(entry),
  });
  const result: BudgetResult = computeBudget({
    income: { amountCents: amount(lines.income), cadence: "monthly" },
    expenses: [...lines.needs, ...lines.wants].map(expense),
    savings: [{ id: lines.saving.key, label: lines.saving.label, monthlyCents: amount(lines.saving) }],
  });
  return {
    remainingCents: result.remainingCents,
    shortfallCents: result.shortfallCents,
    fixedOverIncome: result.surplusCents < 0,
  };
}

// Last month is read as a whole month only when the bank's history starts in
// its first week, so half a month is never shown or judged as the whole month.
// `month` is its first day and `oldest` the oldest transaction's date, both
// YYYY-MM-DD; null when the bank has sent nothing.
export const MONTH_START_SLACK_DAYS = 7;

export function coversMonth(month: string, oldest: string | null): boolean {
  if (oldest === null) return false;
  const days = Math.round((Date.parse(`${oldest}T00:00:00Z`) - Date.parse(`${month}T00:00:00Z`)) / 86_400_000);
  return days <= MONTH_START_SLACK_DAYS;
}

const MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" });

// "October" for "2026-10-01".
export function monthName(month: string): string {
  return MONTH.format(new Date(`${month}T00:00:00Z`));
}

// The last full calendar month on the app's calendar (Eastern, like safe to
// spend's day of the month), as YYYY-MM-01.
export function lastFullMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return `${previous.year}-${String(previous.month).padStart(2, "0")}-01`;
}
