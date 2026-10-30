// Turns a student's bank transactions into the budget waterfall's inputs
// (budget.ts). Pure arithmetic and sorting into groups: no network, nothing
// saved. It is built for Plaid sandbox users first; real students' data waits
// for the privacy page and the other gates the team set for after MVP2.
//
// The transaction type is the few fields we need, shaped like Plaid's
// /transactions/sync output (personal_finance_category), so this does not
// depend on the Plaid code in #72. Convert Plaid's dollars to whole cents
// before calling. Plaid's sign: positive is money out, negative is money in.
//
// Bank data double counts easily, so these are left out and listed in
// `leftOut` instead of silently dropped:
//   - pending transactions (they can change or disappear),
//   - transfers between accounts (not spending),
//   - credit card payments (the card purchases already count),
//   - reversed pay.
// Refunds are netted against the group they came from, never below $0.
//
// The need or want label on each group is a starting guess from the bank's
// category, nothing more. It is the student's budget to relabel.

import type { BudgetInput, Expense, Income, Necessity, PayCadence } from "./budget";

export type SandboxTransaction = {
  id: string;
  // YYYY-MM-DD, the day the bank posted it.
  date: string;
  // Whole cents. Positive is money out, negative is money in (Plaid's sign).
  amountCents: number;
  pending: boolean;
  // Merchant or payer name as the bank shows it.
  name: string;
  // Plaid personal_finance_category.primary, e.g. "FOOD_AND_DRINK".
  category: string | null;
  // Plaid personal_finance_category.detailed, e.g. "FOOD_AND_DRINK_GROCERIES".
  detailedCategory: string | null;
};

export type LeftOutReason = "pending" | "transfer" | "card payment" | "pay reversal";

export type DerivedBudget = {
  input: BudgetInput;
  // Whole months the transactions cover (at least 1). Amounts are averaged
  // over this many months.
  months: number;
  // True when pay did not arrive on a steady schedule in steady amounts, so
  // income is the monthly average instead of a paycheck on a schedule.
  incomeIrregular: boolean;
  leftOut: { id: string; reason: LeftOutReason }[];
};

const DAYS_PER_MONTH = 365 / 12;

const GROUPS: Record<string, { label: string; necessity: Necessity }> = {
  GROCERIES: { label: "Groceries", necessity: "need" },
  RENT_AND_UTILITIES: { label: "Rent and utilities", necessity: "need" },
  TRANSPORTATION: { label: "Getting around", necessity: "need" },
  MEDICAL: { label: "Medical", necessity: "need" },
  LOAN_PAYMENTS: { label: "Loan payments", necessity: "need" },
  GOVERNMENT_AND_NON_PROFIT: { label: "Government and non-profit", necessity: "need" },
  BANK_FEES: { label: "Bank fees", necessity: "need" },
  FOOD_AND_DRINK: { label: "Eating out", necessity: "want" },
  ENTERTAINMENT: { label: "Entertainment", necessity: "want" },
  GENERAL_MERCHANDISE: { label: "Shopping", necessity: "want" },
  PERSONAL_CARE: { label: "Personal care", necessity: "want" },
  TRAVEL: { label: "Travel", necessity: "want" },
  HOME_IMPROVEMENT: { label: "Home", necessity: "want" },
  GENERAL_SERVICES: { label: "Services", necessity: "want" },
  OTHER: { label: "Other", necessity: "want" },
};

function groupKey(t: SandboxTransaction): string {
  if (t.detailedCategory === "FOOD_AND_DRINK_GROCERIES") return "GROCERIES";
  return t.category && t.category in GROUPS ? t.category : "OTHER";
}

function dayNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`date must be YYYY-MM-DD: ${date}`);
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new RangeError(`date must be a real day: ${date}`);
  return Math.round(ms / 86_400_000);
}

function monthKeys(firstDay: number, lastDay: number): string[] {
  const keys: string[] = [];
  const cursor = new Date(firstDay * 86_400_000);
  cursor.setUTCDate(1);
  const end = new Date(lastDay * 86_400_000).toISOString().slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= end) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// A steady schedule: gaps near 7, 14, 15 or 30 days, all within 3 days of
// each other, and every paycheck within 10% of the middle one.
function steadyCadence(deposits: SandboxTransaction[]): PayCadence | null {
  if (deposits.length < 3) return null;
  const days = deposits.map((d) => dayNumber(d.date)).sort((a, b) => a - b);
  const gaps = days.slice(1).map((day, i) => day - days[i]);
  if (Math.max(...gaps) - Math.min(...gaps) > 3) return null;
  const amounts = deposits.map((d) => -d.amountCents);
  const mid = median(amounts);
  if (amounts.some((a) => Math.abs(a - mid) > mid * 0.1)) return null;
  const gap = median(gaps);
  if (gap >= 6 && gap <= 8) return "weekly";
  if (gap >= 13 && gap <= 14) return "biweekly";
  if (gap >= 15 && gap <= 16) return "semimonthly";
  if (gap >= 28 && gap <= 31) return "monthly";
  return null;
}

export function budgetFromTransactions(transactions: SandboxTransaction[]): DerivedBudget {
  for (const t of transactions) {
    if (!Number.isInteger(t.amountCents)) throw new RangeError(`amount must be whole cents: ${t.id}`);
    dayNumber(t.date);
  }

  const leftOut: DerivedBudget["leftOut"] = [];
  const counted: SandboxTransaction[] = [];
  for (const t of transactions) {
    if (t.pending) leftOut.push({ id: t.id, reason: "pending" });
    else if (t.category === "TRANSFER_IN" || t.category === "TRANSFER_OUT") leftOut.push({ id: t.id, reason: "transfer" });
    else if (t.detailedCategory === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") leftOut.push({ id: t.id, reason: "card payment" });
    else if (t.category === "INCOME" && t.amountCents > 0) leftOut.push({ id: t.id, reason: "pay reversal" });
    else counted.push(t);
  }

  const emptyIncome: Income = { amountCents: 0, cadence: "monthly" };
  if (counted.length === 0) {
    return { input: { income: emptyIncome, expenses: [], savings: [] }, months: 1, incomeIrregular: false, leftOut };
  }

  const days = counted.map((t) => dayNumber(t.date));
  const first = Math.min(...days);
  const last = Math.max(...days);
  const months = Math.max(1, Math.round((last - first + 1) / DAYS_PER_MONTH));
  const keys = monthKeys(first, last);

  // Income.
  const deposits = counted.filter((t) => t.category === "INCOME" && t.amountCents < 0);
  const cadence = steadyCadence(deposits);
  const totalIncome = deposits.reduce((sum, t) => sum - t.amountCents, 0);
  const income: Income = cadence
    ? { amountCents: Math.round(median(deposits.map((d) => -d.amountCents))), cadence }
    : { amountCents: Math.round(totalIncome / months), cadence: "monthly" };

  // Spending: everything that is not pay. Money in that is not pay is a refund.
  const spending = counted.filter((t) => t.category !== "INCOME");

  const byName = new Map<string, SandboxTransaction[]>();
  for (const t of spending.filter((s) => s.amountCents > 0)) {
    byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
  }

  const expenses: Expense[] = [];
  const recurringIds = new Set<string>();
  for (const [name, list] of byName) {
    const perMonth = keys.map((key) => list.filter((t) => t.date.startsWith(key)));
    const amounts = list.map((t) => t.amountCents);
    const mid = median(amounts);
    const steady =
      keys.length >= 2 &&
      perMonth.every((month) => month.length === 1) &&
      amounts.every((a) => Math.abs(a - mid) <= mid * 0.1);
    if (!steady) continue;
    const group = GROUPS[groupKey(list[0])];
    expenses.push({
      id: `recurring:${slug(name)}`,
      label: name,
      necessity: group.necessity,
      recurrence: "recurring",
      monthlyCents: Math.round(mid),
    });
    for (const t of list) recurringIds.add(t.id);
  }

  const variableTotals = new Map<string, number>();
  for (const t of spending) {
    if (recurringIds.has(t.id)) continue;
    const key = groupKey(t);
    variableTotals.set(key, (variableTotals.get(key) ?? 0) + t.amountCents);
  }
  for (const [key, total] of variableTotals) {
    const monthly = Math.round(Math.max(0, total) / months);
    if (monthly === 0) continue;
    expenses.push({
      id: `variable:${key.toLowerCase()}`,
      label: GROUPS[key].label,
      necessity: GROUPS[key].necessity,
      recurrence: "variable",
      monthlyCents: monthly,
    });
  }

  return { input: { income, expenses, savings: [] }, months, incomeIrregular: cadence === null && deposits.length > 0, leftOut };
}
