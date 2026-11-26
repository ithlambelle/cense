// Created with Claude Code (2026-11-21).
import "server-only";

import { detectRecurringTransactions, type RecurringCandidate, type RecurringTransaction } from "@/lib/budget/recurring";
import { BILLS, MAX_MONTHLY_CENTS, monthlyFromSemester, SEMESTER_MONTHS, type Bill, type BillAnswer } from "./compute";

// After a student links a bank, Cense answers the setup questions from the
// transactions it just read instead of asking them (Ben, Nov 21: "We shouldn't
// have to ask how much someone's car payment is... We should already know
// it."). Every answer stays editable afterwards; this only fills the first
// version. Plain rules over Plaid's detailed categories plus the #109
// detector, so the same bank always gives the same answers and no bank data
// goes to any AI model.

export type FindingKind = "income" | "family" | Bill;
// found: false is a bill the bank never shows, answered "none" without asking.
export type Finding = { key: string; kind: FindingKind; title: string; detail: string; found: boolean };
export type Inference = { bills: BillAnswer[]; findings: Finding[] };

const DAY = 86_400_000;
// How far back the amounts look: three months smooths a missed or doubled
// month without reaching back to last semester.
const LOOKBACK_DAYS = 92;
// Tuition is lumpy: a semester's bill can land months before the next one.
const TUITION_LOOKBACK_DAYS = SEMESTER_MONTHS * 31;
// Groceries and gas are spread across the month, so they have no real due day.
// The last day keeps them reserved in the rolling 30-day number every day of
// the month, the conservative reading until the per-paycheck planner (D42).
const SPREAD_DUE_DAY = 31;

const RULES: Record<Bill, { categories: readonly string[]; lookbackDays: number }> = {
  rent: { categories: ["RENT_AND_UTILITIES_RENT"], lookbackDays: LOOKBACK_DAYS },
  phone: { categories: ["RENT_AND_UTILITIES_TELEPHONE"], lookbackDays: LOOKBACK_DAYS },
  tuition: { categories: ["GENERAL_SERVICES_EDUCATION"], lookbackDays: TUITION_LOOKBACK_DAYS },
  groceries: { categories: ["FOOD_AND_DRINK_GROCERIES"], lookbackDays: LOOKBACK_DAYS },
  car: {
    categories: ["LOAN_PAYMENTS_CAR_PAYMENT", "TRANSPORTATION_GAS", "TRANSPORTATION_PARKING"],
    lookbackDays: LOOKBACK_DAYS,
  },
};

const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dayOfMonth = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDate();

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  // Ties go to the earlier day, so a bill is reserved before it can be due.
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export function dollars(cents: number): string {
  const whole = Math.round(cents / 100);
  return `$${whole.toLocaleString("en-US")}`;
}

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${{ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th"}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function cadenceText(candidate: RecurringCandidate): string {
  const weekday = WEEKDAYS[new Date(`${candidate.nextDate}T00:00:00Z`).getUTCDay()];
  switch (candidate.cadence) {
    case "weekly":
      return `every ${weekday}`;
    case "biweekly":
      return `every other ${weekday}`;
    case "semimonthly":
      return "twice a month";
    default:
      return `on the ${ordinal(dayOfMonth(candidate.nextDate))}`;
  }
}

// Spending rows for one bill in its window: posted money out only, so a refund
// or a pending charge never moves the answer.
function billRows(rows: readonly RecurringTransaction[], bill: Bill, asOf: number): RecurringTransaction[] {
  const { categories, lookbackDays } = RULES[bill];
  return rows.filter(
    (row) =>
      !row.pending &&
      row.amount_cents > 0 &&
      categories.includes(row.category_detailed ?? "") &&
      time(row.posted_on) <= asOf &&
      time(row.posted_on) > asOf - lookbackDays * DAY,
  );
}

// The middle month's total, over whole calendar months only: the window
// always cuts into its first and last month, and a part month would pull the
// answer down (and safe to spend up). With no whole month yet (a short
// history), every month counts.
function monthlyCents(rows: readonly RecurringTransaction[], asOf: number, lookbackDays: number): number {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const month = row.posted_on.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + row.amount_cents);
  }
  const windowStart = asOf - lookbackDays * DAY;
  const whole = [...byMonth].filter(([month]) => {
    const first = time(`${month}-01`);
    const [year, index] = month.split("-").map(Number);
    const last = Date.UTC(year, index, 0);
    return first > windowStart && last <= asOf;
  });
  return Math.min(MAX_MONTHLY_CENTS, median((whole.length ? whole : [...byMonth]).map(([, cents]) => cents)));
}

function biggestPayee(rows: readonly RecurringTransaction[]): string | null {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const name = row.merchant_name?.trim();
    if (name) totals.set(name, (totals.get(name) ?? 0) + row.amount_cents);
  }
  return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function inferBill(bill: Bill, rows: readonly RecurringTransaction[], asOf: number): { answer: BillAnswer; finding: Finding } {
  const seen = billRows(rows, bill, asOf);
  const label = { rent: "Rent", phone: "Phone", tuition: "Tuition", groceries: "Groceries", car: "Car" }[bill];
  if (seen.length === 0) {
    return {
      answer: { bill, coveredBy: "none", monthlyCents: null, dueDay: null },
      finding: { key: bill, kind: bill, title: label, detail: `No ${label.toLowerCase()} payments from your bank`, found: false },
    };
  }
  if (bill === "tuition") {
    const total = Math.min(MAX_MONTHLY_CENTS * SEMESTER_MONTHS, seen.reduce((sum, row) => sum + row.amount_cents, 0));
    return {
      answer: { bill, coveredBy: "me", monthlyCents: monthlyFromSemester(total), dueDay: null },
      finding: { key: bill, kind: bill, title: label, detail: `${dollars(total)} this semester`, found: true },
    };
  }
  const amount = monthlyCents(seen, asOf, RULES[bill].lookbackDays);
  const spread = bill === "groceries" || (bill === "car" && !seen.some((row) => row.category_detailed === "LOAN_PAYMENTS_CAR_PAYMENT"));
  const dueDay = spread ? SPREAD_DUE_DAY : mostCommon(seen.map((row) => dayOfMonth(row.posted_on)));
  const payee = bill === "phone" ? biggestPayee(seen) : null;
  const detail = spread
    ? `About ${dollars(amount)} a month`
    : `${payee ? `${payee}, ` : ""}${dollars(amount)} on the ${ordinal(dueDay)}`;
  return {
    answer: { bill, coveredBy: "me", monthlyCents: amount, dueDay },
    finding: { key: bill, kind: bill, title: label, detail, found: true },
  };
}

// asOf is today's date on the student's calendar, YYYY-MM-DD.
export function inferSetup(rows: readonly RecurringTransaction[], asOf: string): Inference {
  const today = time(asOf);
  const findings: Finding[] = [];
  for (const candidate of detectRecurringTransactions(rows, asOf)) {
    if (candidate.kind !== "income") continue;
    findings.push(
      candidate.familySupport
        ? {
            key: `family:${candidate.key}`,
            kind: "family",
            title: "Money from family",
            // The detector names family money generically (#109), never the sender.
            detail: `${dollars(candidate.amountCents)} ${cadenceText(candidate)}`,
            found: true,
          }
        : {
            key: `income:${candidate.key}`,
            kind: "income",
            title: "Your pay",
            detail: `${candidate.name}, about ${dollars(candidate.amountCents)} ${cadenceText(candidate)}`,
            found: true,
          },
    );
  }
  const bills = BILLS.map((bill) => inferBill(bill, rows, today));
  return { bills: bills.map((b) => b.answer), findings: [...findings, ...bills.map((b) => b.finding)] };
}
