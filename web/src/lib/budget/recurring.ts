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
  merchant_name: string | null;
};

export type RecurringCandidate = {
  key: string;
  name: string;
  kind: "bill" | "income";
  cadence: "weekly" | "biweekly" | "monthly";
  amountCents: number;
  nextDate: string;
  occurrences: number;
};

const DAY = 86_400_000;
const EXCLUDED = new Set(["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"]);
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
  const groups = new Map<string, { kind: RecurringCandidate["kind"]; observations: Observation[] }>();
  const seen = new Set<string>();
  for (const row of rows) {
    const day = dayOf(row.posted_on);
    const name = row.merchant_name?.trim().replace(/\s+/g, " ");
    if (row.pending || !name || !row.account_id || !row.transaction_id || day === null || day < today - 180 || day > today ||
      !Number.isSafeInteger(row.amount_cents) || row.amount_cents === 0 || EXCLUDED.has(row.category ?? "")) continue;
    const kind = row.amount_cents < 0 ? "income" : "bill";
    // Don't count refunds or other credits as income; unidentified payees
    // aren't grouped together, because they can be different employers.
    if ((kind === "income") !== (row.category === "INCOME") || seen.has(row.transaction_id)) continue;
    seen.add(row.transaction_id);
    const identity = JSON.stringify([row.account_id, kind, name.normalize("NFKC").toLowerCase()]);
    const group = groups.get(identity) ?? { kind, observations: [] };
    group.observations.push({ day, amount: Math.abs(row.amount_cents), name });
    groups.set(identity, group);
  }

  const candidates: RecurringCandidate[] = [];
  for (const [identity, { kind, observations }] of groups) {
    if (observations.length < 3) continue;
    observations.sort((a, b) => a.day - b.day);
    const first = observations[0].day;
    const last = observations[observations.length - 1];
    const amounts = observations.map((row) => row.amount).sort((a, b) => a - b);
    const middle = Math.floor(amounts.length / 2);
    const amountCents = amounts.length % 2 ? amounts[middle] : amounts[middle - 1] + Math.round((amounts[middle] - amounts[middle - 1]) / 2);
    if (amounts.some((amount) => Math.abs(amount - amountCents) > Math.max(50, amountCents * 0.3))) continue;
    for (const { cadence, days, tolerance } of PATTERNS) {
      const expected = (index: number) => days === null ? plusMonths(first, index) : first + index * days;
      if (!observations.every((row, index) => Math.abs(row.day - expected(index)) <= tolerance)) continue;
      const next = expected(observations.length);
      if (next < today - tolerance) continue;
      candidates.push({
        // Internal, stable across dates, amounts and category corrections.
        key: createHash("sha256").update(identity).digest("hex"),
        name: last.name, kind, cadence, amountCents, nextDate: iso(next), occurrences: observations.length,
      });
      break;
    }
  }
  return candidates.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.key.localeCompare(b.key));
}
