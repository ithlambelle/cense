// Created with Claude Code (2026-11-13). The lines of Your money's This month
// tab (Figma 709:1769, 709:1865), from the student's stored transactions and
// the numbers they typed, and the total at the top. Pure, shared by the server
// and the screen, which recomputes as the student types.
//
// - Income: the last full calendar month's income (income_by_month).
// - Needs and wants: one line per Cense category with spending in that month
//   (categories.ts), plus any line the student typed a number for.
// - Bills from the safe-to-spend answers that the bank did not show that
//   month (a phone bill paid from an account Cense cannot see) are added to the
//   line the bank would have put them on, so This month counts every bill
//   Today keeps back. A bill the bank shows is never counted twice
//   (billsFromAnswers).
// - Saving: the safe-to-spend set-aside, which the student typed; a $0 goal
//   is not called typed.
// A typed number replaces the bank's for that line; untyped lines follow the
// bank. The arithmetic is draft PR #86's waterfall (budget.ts).

import type { Bill, BillAnswer } from "@/lib/safe-to-spend/compute";

import { computeBudget, type BudgetResult, type Expense, type Recurrence } from "./budget";
import { BUDGET_CATEGORIES, censeCategory, spendingByCategory, type CategoryKey, type DetailedTotal } from "./categories";

export type LineKey = "income" | CategoryKey;
export type LineGroup = "income" | "need" | "want" | "saving";

export type BudgetLine = {
  key: LineKey | "saving";
  label: string;
  group: LineGroup;
  amountCents: number;
  // The bank's number for the line, null for a line the bank has nothing for
  // (and for saving, which has no bank number).
  bankCents: number | null;
  typed: boolean;
  // Bills from the safe-to-spend answers the bank did not show this month,
  // added to the bank's number: the part not shown (amountCents) and the part
  // the bank already showed somewhere (seenCents). Empty for most lines.
  answers: { bill: Bill; amountCents: number; seenCents: number }[];
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

// Where the bank can show each bill the setup questions ask about, as Plaid
// detailed categories. `own` is the bill's own category (the same as Penny's
// reading of the bank); its first entry names the This month line the bill
// belongs on, through censeCategory, so a bill from the answers lands where
// the bank would have put it. `also` is where the same payment often lands
// under another name: groceries bought at a superstore, car insurance. Money
// sent through a payment app or to a person (TRANSFER_OUT, Other) can be any
// bill, such as rent paid by Zelle.
const BILL_CATEGORIES: Record<Bill, { own: readonly (readonly [string, string])[]; also: readonly string[] }> = {
  rent: { own: [["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"]], also: [] },
  phone: { own: [["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE"]], also: ["RENT_AND_UTILITIES_INTERNET_AND_CABLE"] },
  tuition: { own: [["GENERAL_SERVICES", "GENERAL_SERVICES_EDUCATION"]], also: [] },
  groceries: {
    own: [["FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"]],
    also: ["GENERAL_MERCHANDISE_SUPERSTORES", "GENERAL_MERCHANDISE_DISCOUNT_STORES", "GENERAL_MERCHANDISE_CONVENIENCE_STORES"],
  },
  car: {
    own: [
      ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"],
      ["TRANSPORTATION", "TRANSPORTATION_GAS"],
      ["TRANSPORTATION", "TRANSPORTATION_PARKING"],
    ],
    also: ["GENERAL_SERVICES_INSURANCE", "GENERAL_SERVICES_AUTOMOTIVE", "TRANSPORTATION_TOLLS"],
  },
};

export function billLine(bill: Bill): CategoryKey {
  const [primary, detailed] = BILL_CATEGORIES[bill].own[0];
  return censeCategory(primary, detailed)!;
}

export type BillFromAnswers = BudgetLine["answers"][number];

// The part of each bill the student pays that the month's spending does not
// already show, by the line it belongs on. Totals only, so the rule is about
// money, not names: each dollar the bank shows pays at most one bill.
// 1. The bill's own category and the categories it often lands under count
//    toward it, in part: groceries at a superstore, insurance toward the car.
//    Spending there that is not the bill can only hide part of it (a $12
//    parking charge leaves $288 of a $300 car bill), never add to it.
// 2. Money sent to people or payment apps counts only when it covers all of
//    what is left of the bill, as one payment would (rent by Zelle). Smaller
//    sums are most likely friends being paid back, so they hide nothing.
// Never counted twice: a bill the bank shows anywhere above adds nothing.
// Missed: a bill paid elsewhere while the student sends at least as much to
// people that month (a $45 phone and $100 of Venmo); then the line is the
// bank's alone, as it was before bills from the answers were added.
function billsFromAnswers(bills: BillAnswer[], totals: DetailedTotal[]): Partial<Record<CategoryKey, BudgetLine["answers"]>> {
  const left = new Map<string, number>();
  for (const row of totals) {
    if (row.categoryDetailed && row.outCents > 0) left.set(row.categoryDetailed, (left.get(row.categoryDetailed) ?? 0) + row.outCents);
  }
  const take = (detailed: string, cents: number): number => {
    const used = Math.min(left.get(detailed) ?? 0, cents);
    if (used > 0) left.set(detailed, (left.get(detailed) ?? 0) - used);
    return cents - used;
  };
  const paying = bills.filter((answer) => (answer.coveredBy === "me" || answer.coveredBy === "split") && (answer.monthlyCents ?? 0) > 0);
  // Every bill's own category first, so one bill never takes another's.
  const unseen = new Map<Bill, number>();
  for (const answer of paying) unseen.set(answer.bill, BILL_CATEGORIES[answer.bill].own.reduce((cents, [, detailed]) => take(detailed, cents), answer.monthlyCents!));
  for (const answer of paying) unseen.set(answer.bill, BILL_CATEGORIES[answer.bill].also.reduce((cents, detailed) => take(detailed, cents), unseen.get(answer.bill)!));
  const transfers = [...left.keys()].filter((detailed) => detailed.startsWith("TRANSFER_OUT_"));
  const byLine: Partial<Record<CategoryKey, BudgetLine["answers"]>> = {};
  for (const answer of paying) {
    let cents = unseen.get(answer.bill)!;
    const sent = transfers.reduce((sum, detailed) => sum + (left.get(detailed) ?? 0), 0);
    if (cents > 0 && sent >= cents) cents = transfers.reduce((rest, detailed) => take(detailed, rest), cents);
    if (cents <= 0) continue;
    (byLine[billLine(answer.bill)] ??= []).push({ bill: answer.bill, amountCents: cents, seenCents: answer.monthlyCents! - cents });
  }
  return byLine;
}

// A bill from the answers as the student changes its amount on Today: what
// the bank showed of it stays, the rest is added. Gone once nothing is left.
export function withBillAmount(entry: BillFromAnswers, monthlyCents: number | null): BillFromAnswers | null {
  const cents = (monthlyCents ?? 0) - entry.seenCents;
  return cents > 0 ? { ...entry, amountCents: cents } : null;
}

// A line's number when the student has not typed one: the bank's, plus any
// bills from the answers. Undo on This month goes back to it.
export function untypedCents(line: Pick<BudgetLine, "bankCents" | "answers">): number {
  return (line.bankCents ?? 0) + line.answers.reduce((sum, entry) => sum + entry.amountCents, 0);
}

export function buildBudgetLines({
  month,
  incomeCents,
  totals,
  typed,
  setAsideCents,
  bills = [],
  hasBankData,
}: {
  month: string;
  // null when the month had no income
  incomeCents: number | null;
  totals: DetailedTotal[];
  typed: Partial<Record<LineKey, number>>;
  setAsideCents: number;
  // The safe-to-spend answers. Only read once the bank has sent something:
  // before that there is no way to tell which bills it shows.
  bills?: BillAnswer[];
  hasBankData: boolean;
}): BudgetLines {
  const spent = spendingByCategory(totals);
  const fromAnswers = hasBankData ? billsFromAnswers(bills, totals) : {};
  const line = (key: LineKey, label: string, group: LineGroup, bankCents: number | null): BudgetLine => {
    const answers = key === "income" ? [] : (fromAnswers[key] ?? []);
    return {
      key,
      label,
      group,
      bankCents,
      typed: typed[key] !== undefined,
      answers,
      amountCents: typed[key] ?? untypedCents({ bankCents, answers }),
      recurrence: null,
    };
  };
  const categoryLines = BUDGET_CATEGORIES.filter(
    (category) => spent[category.key] !== undefined || typed[category.key] !== undefined || fromAnswers[category.key] !== undefined,
  ).map((category) => line(category.key, category.label, category.group, spent[category.key] ?? null));
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
      // Only the student sets a savings goal, but $0 is no goal at all, and
      // saying "You typed" under it claims something they never did.
      typed: setAsideCents > 0,
      answers: [],
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
