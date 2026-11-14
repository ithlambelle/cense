import "server-only";

import { createHash } from "node:crypto";

// The subset of the private US-14 transaction projection used by detection.
export type RecurringTransaction = {
  transaction_id: string;
  account_id: string;
  posted_on: string;
  amount_cents: number;
  pending: boolean;
  category: string | null;
  category_detailed?: string | null;
  merchant_name: string | null;
};

export type RecurringCandidate = {
  key: string;
  name: string;
  kind: "bill" | "income";
  familySupport?: true;
  cadence: "weekly" | "biweekly" | "monthly";
  amountCents: number;
  nextDate: string;
  occurrences: number;
};

const DAY = 86_400_000;
const PAYMENT_APP_CASH_OUT = /^(?:venmo|cash ?app|pay ?pal)$|\b(?:venmo|cash ?app|pay ?pal)\b.*\b(?:cash[ -]?out|transfer)\b/i;
const STUDENT_LOAN = "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT";
const NON_INCOME_TRANSFERS = new Set([
  "TRANSFER_IN_ACCOUNT_TRANSFER",
  "TRANSFER_IN_SAVINGS",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_IN_CASH_ADVANCES_AND_LOANS",
  "TRANSFER_IN_TRANSFER_IN_FROM_APPS",
]);
const PATTERNS = [
  { cadence: "weekly", days: 7, tolerance: 1 },
  { cadence: "biweekly", days: 14, tolerance: 2 },
  { cadence: "monthly", days: null, tolerance: 3 },
] as const;

function iso(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

function dayOf(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = Date.parse(`${date}T00:00:00Z`) / DAY;
  return Number.isFinite(day) && iso(day) === date ? day : null;
}

function plusMonths(day: number, months: number): number {
  const anchor = new Date(day * DAY);
  anchor.setUTCDate(1);
  anchor.setUTCMonth(anchor.getUTCMonth() + months + 1);
  anchor.setUTCDate(0);
  const original = new Date(day * DAY).getUTCDate();
  anchor.setUTCDate(Math.min(original, anchor.getUTCDate()));
  return anchor.getTime() / DAY;
}

// Call once per student with posted USD rows. This produces suggestions, not
// confirmed bills. Requiring three observations deliberately leaves annual
// and other poorly evidenced streams unclassified in a 180-day window.
export function detectRecurringTransactions(rows: readonly RecurringTransaction[], asOf: string): RecurringCandidate[] {
  const today = dayOf(asOf);
  if (today === null) throw new RangeError("Expected a valid YYYY-MM-DD date");
  type Observation = { day: number; amount: number; name: string };
  type Group = { kind: RecurringCandidate["kind"]; familySupport: boolean; unnamed: boolean; observations: Observation[] };
  const groups = new Map<string, Group>();
  const outgoing = new Map<number, Map<number, Set<string>>>();
  for (const row of rows) {
    if (row.pending || row.category !== "TRANSFER_OUT" || !row.account_id || !Number.isSafeInteger(row.amount_cents) || row.amount_cents <= 0) continue;
    const day = dayOf(row.posted_on);
    if (day === null || day > today || day < today - 183) continue;
    const days = outgoing.get(row.amount_cents) ?? new Map<number, Set<string>>();
    const accounts = days.get(day) ?? new Set<string>();
    accounts.add(row.account_id);
    days.set(day, accounts);
    outgoing.set(row.amount_cents, days);
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const day = dayOf(row.posted_on);
    const merchant = row.merchant_name?.trim().replace(/\s+/g, " ");
    const detail = row.category_detailed;
    if (row.pending || !row.account_id || !row.transaction_id || day === null || day < today - 180 || day > today ||
      !Number.isSafeInteger(row.amount_cents) || row.amount_cents === 0 || seen.has(row.transaction_id)) continue;

    const kind = row.amount_cents < 0 ? "income" : "bill";
    const amount = Math.abs(row.amount_cents);
    const studentLoan = row.category === "LOAN_PAYMENTS" && detail === STUDENT_LOAN;
    const deposit = row.category === "TRANSFER_IN" && detail === "TRANSFER_IN_DEPOSIT";
    let familySupport = false;
    if (kind === "income") {
      if (row.category === "TRANSFER_IN" && !NON_INCOME_TRANSFERS.has(detail ?? "")) {
        const matchingDays = outgoing.get(amount);
        if (matchingDays && [-3, -2, -1, 0, 1, 2, 3].some((offset) =>
          [...(matchingDays.get(day + offset) ?? [])].some((account) => account !== row.account_id))) continue;
        // A payment app name alone cannot distinguish a sender from a cash-out.
        if (!deposit && (!merchant || PAYMENT_APP_CASH_OUT.test(merchant))) continue;
        familySupport = !deposit;
      } else if (row.category !== "INCOME") {
        continue;
      }
    } else if (row.category === "INCOME" || row.category === "TRANSFER_IN" || row.category === "TRANSFER_OUT" ||
      (row.category === "LOAN_PAYMENTS" && !studentLoan)) {
      continue;
    }
    if (!merchant && kind === "bill" && !studentLoan) continue;
    seen.add(row.transaction_id);
    const name = merchant || (studentLoan ? "Student loan payment" : deposit ? "Deposit" : "Income");
    const source = merchant ? merchant.normalize("NFKC").toLowerCase() : detail ?? row.category;
    const identity = JSON.stringify([row.account_id, kind, source, ...(!merchant || familySupport ? [!merchant, familySupport] : [])]);
    const group = groups.get(identity) ?? { kind, familySupport, unnamed: !merchant, observations: [] };
    group.observations.push({ day, amount, name });
    groups.set(identity, group);
  }

  const candidates: RecurringCandidate[] = [];
  for (const [identity, { kind, familySupport, unnamed, observations }] of groups) {
    const bands: Observation[][] = [];
    if (unnamed) {
      for (const observation of observations.sort((a, b) => a.amount - b.amount)) {
        const band = bands[bands.length - 1];
        if (band && observation.amount <= band[0].amount * 1.3) band.push(observation);
        else bands.push([observation]);
      }
    } else {
      bands.push(observations);
    }
    for (const band of bands) {
      const key = unnamed ? JSON.stringify([identity, band[0].amount]) : identity;
      const candidate = estimateCandidate(key, kind, familySupport, band, today);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.key.localeCompare(b.key));
}

function estimateCandidate(
  identity: string,
  kind: RecurringCandidate["kind"],
  familySupport: boolean,
  observations: { day: number; amount: number; name: string }[],
  today: number,
): RecurringCandidate | undefined {
  if (observations.length < 3) return;
  observations.sort((a, b) => a.day - b.day);
  const first = observations[0].day;
  const last = observations[observations.length - 1];
  const amounts = observations.map((row) => row.amount).sort((a, b) => a - b);
  const middle = Math.floor(amounts.length / 2);
  const amountCents = amounts.length % 2 ? amounts[middle] : amounts[middle - 1] + Math.round((amounts[middle] - amounts[middle - 1]) / 2);
  if (amounts.some((amount) => Math.abs(amount - amountCents) > Math.max(50, amountCents * 0.3))) return;
  for (const { cadence, days, tolerance } of PATTERNS) {
    const expected = (index: number) => days === null ? plusMonths(first, index) : first + index * days;
    if (!observations.every((row, index) => Math.abs(row.day - expected(index)) <= tolerance)) continue;
    const next = expected(observations.length);
    if (next < today - tolerance) continue;
    return {
      // Named streams retain their key when dates or amounts change.
      key: createHash("sha256").update(identity).digest("hex"),
      name: last.name, kind, cadence, amountCents, nextDate: iso(next), occurrences: observations.length,
      ...(familySupport ? { familySupport: true } as const : {}),
    };
  }
}
