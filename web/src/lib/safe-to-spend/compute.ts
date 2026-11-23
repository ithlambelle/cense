// Safe to spend (US-12, MVP2 Flow C): one daily number from a linked bank's
// balances and the student's own answers, with every step shown on "How we
// got this". Pure and shared by the server and the screens.
//
// Safe to spend a day = (cash in checking - card balances - bills you cover
// - set aside) / 30, never below zero.
// - A rolling 30 days, not "until payday": student income is lumpy (family
//   transfers, aid refunds, shifts), and any new money simply raises the cash
//   it starts from.
// - Family support needs no number of its own: money family sends lands in
//   checking, and a bill family covers is not subtracted (Figma 222:2090,
//   "Family support counts as income").
// - A card's whole balance is subtracted: it is money already spent.
// - Every bill due in the 30 days the number covers is subtracted, today
//   included (Ben, Nov 23, replacing "still to come this month" from Oct 27). A
//   date already past is paid and its money has left checking, but next month's
//   date often falls inside the 30 days and must be kept back. A monthly bill
//   can land twice (January 31 and February 28) or, rarely, not at all (January
//   2 to 31 misses a bill on the 1st). Tuition is asked per semester, turned
//   into a monthly figure and has no due day, so it is always kept back once.
// - Savings and similar accounts are shown but not counted.

import { addDays, datesOnDay } from "@/lib/reminders/schedule";

export const BILLS = ["rent", "phone", "tuition", "groceries", "car"] as const;
export type Bill = (typeof BILLS)[number];

// The questions' steps: 1 to 5 are the bills, 6 is the set-aside.
export const SET_ASIDE_STEP = BILLS.length + 1;

export const COVERED_BY = ["me", "family", "split", "none"] as const;
export type CoveredBy = (typeof COVERED_BY)[number];

export type AccountKind = "cash" | "card" | "other";

export const SPREAD_DAYS = 30;

// The largest monthly amount a student can enter for one bill or the set-aside.
export const MAX_MONTHLY_CENTS = 10_000_000;

export type BalanceRow = { name: string; mask: string | null; kind: AccountKind; balanceCents: number };
// dueDay: the day of the month the bill is due (1 to 31), for the bills the
// student pays; null for tuition and for bills they do not pay.
export type BillAnswer = { bill: Bill; coveredBy: CoveredBy; monthlyCents: number | null; dueDay: number | null };

// The bill asked per semester rather than per month.
export const SEMESTER_BILL: Bill = "tuition";
// A semester's tuition is spread over about four months.
export const SEMESTER_MONTHS = 4;

export function monthlyFromSemester(semesterCents: number): number {
  return Math.round(semesterCents / SEMESTER_MONTHS);
}

export function semesterFromMonthly(monthlyCents: number): number {
  return monthlyCents * SEMESTER_MONTHS;
}

export type SafeToSpendSum = {
  cashCents: number;
  cardCents: number;
  billsCents: number;
  setAsideCents: number;
  leftCents: number;
  days: typeof SPREAD_DAYS;
  dailyCents: number;
};

const isDueDay = (day: number | null): day is number => day !== null && Number.isInteger(day) && day >= 1 && day <= 31;

// How many times a bill comes due in the 30 days from `today` (YYYY-MM-DD),
// today included. A bill with no due day (tuition) is kept back once.
export function billTimesDue(answer: BillAnswer, today: string): number {
  if (!isDueDay(answer.dueDay)) return 1;
  return datesOnDay(answer.dueDay, today, addDays(today, SPREAD_DAYS - 1)).length;
}

// What a bill takes out of the student's next 30 days: their amount each time
// it comes due, when they pay all or part of it. Nothing when family covers it
// or it does not apply.
export function billCents(answer: BillAnswer, today: string): number {
  if (answer.coveredBy !== "me" && answer.coveredBy !== "split") return 0;
  return (answer.monthlyCents ?? 0) * billTimesDue(answer, today);
}

export function computeSafeToSpend({
  accounts,
  bills,
  setAsideCents,
  today,
}: {
  accounts: BalanceRow[];
  bills: BillAnswer[];
  setAsideCents: number;
  // Today on the student's calendar (YYYY-MM-DD).
  today: string;
}): SafeToSpendSum {
  const cashCents = accounts.filter((a) => a.kind === "cash").reduce((sum, a) => sum + a.balanceCents, 0);
  // A card paid past zero owes nothing; it does not add cash.
  const cardCents = accounts.filter((a) => a.kind === "card").reduce((sum, a) => sum + Math.max(0, a.balanceCents), 0);
  const billsCents = bills.reduce((sum, answer) => sum + billCents(answer, today), 0);
  const leftCents = cashCents - cardCents - billsCents - setAsideCents;
  return {
    cashCents,
    cardCents,
    billsCents,
    setAsideCents,
    leftCents,
    days: SPREAD_DAYS,
    dailyCents: leftCents > 0 ? Math.floor(leftCents / SPREAD_DAYS) : 0,
  };
}

// Plaid's account as far as Cense reads it.
export type BankAccountInput = {
  balances: { available: number | null; current: number | null; iso_currency_code: string | null };
  mask: string | null;
  name: string;
  type: string;
  subtype: string | null;
};

// Everyday money: what a student spends from day to day.
const CASH_SUBTYPES = new Set(["checking", "prepaid", "cash management", "paypal"]);

// Which part of the sum an account is, or null for one Cense never stores
// (loans, investments, anything else).
export function accountKind(type: string, subtype: string | null): AccountKind | null {
  if (type === "depository") return subtype !== null && CASH_SUBTYPES.has(subtype) ? "cash" : "other";
  if (type === "credit") return "card";
  return null;
}

const toCents = (dollars: number) => Math.round(dollars * 100);

// The rows saved after each read from Plaid: name, last digits, kind and one
// balance in cents. Cash and savings use what is available to spend (falling
// back to the current balance); a card uses what is owed. Accounts in another
// currency, with no balance, or of a kind Cense does not store are left out.
export function balanceRows(accounts: BankAccountInput[]): BalanceRow[] {
  const rows: BalanceRow[] = [];
  for (const account of accounts) {
    const kind = accountKind(account.type, account.subtype);
    if (kind === null || account.balances.iso_currency_code !== "USD") continue;
    const dollars = kind === "card" ? account.balances.current : (account.balances.available ?? account.balances.current);
    if (dollars === null || !Number.isFinite(dollars)) continue;
    const mask = account.mask && /^[0-9A-Za-z]{1,4}$/.test(account.mask) ? account.mask : null;
    const name = account.name.trim().slice(0, 100) || "Account";
    rows.push({ name, mask, kind, balanceCents: toCents(dollars) });
    if (rows.length === 50) break;
  }
  return rows;
}

// Balances older than this are read again when Home opens.
export const STALE_AFTER_MS = 60 * 60 * 1000;

export function isStale(refreshedAt: string | null, now: number): boolean {
  return refreshedAt === null || now - new Date(refreshedAt).getTime() > STALE_AFTER_MS;
}
