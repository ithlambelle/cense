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
  description?: string | null;
};

export type RecurringCandidate = {
  key: string;
  name: string;
  kind: "bill" | "income";
  familySupport?: true;
  amountCents: number;
  nextDate: string;
  occurrences: number;
} & (
  | { cadence: "weekly" | "biweekly" | "monthly" }
  | { cadence: "semimonthly"; paydayDays: readonly [Payday, Payday] }
);

type Payday = number | "last";

const DAY = 86_400_000;
const GENERIC_APP_OR_TRANSFER = /^(?:venmo|cash ?app|pay ?pal)$|\b(?:venmo|cash ?app|pay ?pal)\b.*\b(?:cash[ -]?out|transfer)\b/i;
const CASH_OUT = /\b(?:cash[ -]?out|instant transfer|standard transfer|transfer to bank|bank transfer|add money|top ?up)\b/i;
const OWN_ACCOUNT = /\b(?:from|to)\s+(?:my\s+)?(?:chk|checking|sav|savings|acct|account|brokerage|x+\d|\*+\d|#\d)/i;
const SENDER = /\bfrom\s+([a-z].*)/i;
const RECIPIENT = /\bto\s+([a-z].*)/i;
const GENERIC_PAYEE = /^(?:zelle|venmo|cash ?app|pay ?pal|apple cash|transfer|payment)$/i;
const NON_BILL_OUTFLOWS = new Set([
  "TRANSFER_OUT_SAVINGS",
  "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_WITHDRAWAL",
]);
const REFERENCE_SUFFIX = /\s+(?:(?:conf(?:irmation)?|ref(?:erence)?|trace)(?:\b|#)|(?:ppd\s+)?id\b).*$/i;
const STUDENT_LOAN = "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT";
const NON_INCOME_TRANSFERS = new Set([
  "TRANSFER_IN_SAVINGS",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_IN_CASH_ADVANCES_AND_LOANS",
]);
const PATTERNS = [
  { cadence: "weekly", days: 7, tolerance: 1 },
  { cadence: "biweekly", days: 14, tolerance: 2 },
  { cadence: "monthly", days: null, tolerance: 3 },
] as const;

// Keep this fallback aligned with plaid.is_income in the transaction-description migration.
function transferSender(description: string, merchant: string, detail: string | null | undefined): string | undefined {
  const sender = description.match(SENDER)?.[1].replace(REFERENCE_SUFFIX, "").trim();
  if (sender) return sender;
  if (detail === "TRANSFER_IN_ACCOUNT_TRANSFER") return /\bzelle\b/i.test(merchant) ? merchant : undefined;
  if (detail === "TRANSFER_IN_TRANSFER_IN_FROM_APPS") return;
  if (merchant && !GENERIC_APP_OR_TRANSFER.test(merchant)) return merchant;
}

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
  const transfers = new Map<number, Map<number, Set<string>>>();
  for (const row of rows) {
    const isTransfer = row.amount_cents > 0 ? row.category === "TRANSFER_OUT" : row.category === "TRANSFER_IN";
    if (row.pending || !isTransfer || !row.account_id || !Number.isSafeInteger(row.amount_cents) || row.amount_cents === 0) continue;
    const day = dayOf(row.posted_on);
    if (day === null || day > today || day < today - 183) continue;
    const days = transfers.get(row.amount_cents) ?? new Map<number, Set<string>>();
    const accounts = days.get(day) ?? new Set<string>();
    accounts.add(row.account_id);
    days.set(day, accounts);
    transfers.set(row.amount_cents, days);
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const day = dayOf(row.posted_on);
    const merchant = row.merchant_name?.trim().replace(/\s+/g, " ") ?? "";
    const detail = row.category_detailed;
    if (row.pending || !row.account_id || !row.transaction_id || day === null || day < today - 180 || day > today ||
      !Number.isSafeInteger(row.amount_cents) || row.amount_cents === 0 || seen.has(row.transaction_id)) continue;

    const kind = row.amount_cents < 0 ? "income" : "bill";
    const amount = Math.abs(row.amount_cents);
    const studentLoan = row.category === "LOAN_PAYMENTS" && detail === STUDENT_LOAN;
    const deposit = row.category === "TRANSFER_IN" && detail === "TRANSFER_IN_DEPOSIT";
    const description = row.description?.trim().replace(/\s+/g, " ") ?? "";
    let familySupport = false;
    let transferParty: string | undefined;
    if (row.category === "TRANSFER_IN" || row.category === "TRANSFER_OUT") {
      const matchingDays = transfers.get(-row.amount_cents);
      if (matchingDays && [-3, -2, -1, 0, 1, 2, 3].some((offset) =>
        [...(matchingDays.get(day + offset) ?? [])].some((account) => account !== row.account_id))) continue;
      const transferText = `${merchant} ${description}`;
      if (CASH_OUT.test(transferText) || OWN_ACCOUNT.test(description)) continue;
      if (row.category === "TRANSFER_IN") {
        if (kind !== "income" || NON_INCOME_TRANSFERS.has(detail ?? "")) continue;
        if (!deposit) {
          transferParty = transferSender(description, merchant, detail);
          if (!transferParty) continue;
          familySupport = true;
        }
      } else {
        if (kind !== "bill" || NON_BILL_OUTFLOWS.has(detail ?? "")) continue;
        // Budget totals include generic app payments. A recurring bill
        // suggestion also needs a recipient to avoid combining unrelated payments.
        transferParty = description.match(RECIPIENT)?.[1].replace(REFERENCE_SUFFIX, "").trim();
        if (!transferParty && detail !== "TRANSFER_OUT_ACCOUNT_TRANSFER" && merchant &&
          !GENERIC_PAYEE.test(merchant) && !GENERIC_APP_OR_TRANSFER.test(merchant)) transferParty = merchant;
        if (!transferParty) continue;
      }
    } else if ((kind === "income") !== (row.category === "INCOME") ||
      (row.category === "LOAN_PAYMENTS" && !studentLoan)) {
      continue;
    }
    if (!merchant && !transferParty && kind === "bill" && !studentLoan) continue;
    seen.add(row.transaction_id);
    const transferName = kind === "income" ? "Family support" : "Recurring payment";
    const name = transferParty && transferParty !== merchant ? transferName : merchant ||
      (studentLoan ? "Student loan payment" : deposit ? "Deposit" : "Income");
    const knownSource = transferParty || merchant;
    const source = knownSource ? knownSource.normalize("NFKC").toLowerCase() : detail ?? row.category;
    const unnamed = !knownSource;
    const identity = JSON.stringify([row.account_id, kind, source, ...(unnamed || familySupport ? [unnamed, familySupport] : [])]);
    const group = groups.get(identity) ?? { kind, familySupport, unnamed, observations: [] };
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

function payday(month: number, day: Payday): number {
  const last = new Date(Date.UTC(Math.floor(month / 12), month % 12 + 1, 0));
  last.setUTCDate(day === "last" ? last.getUTCDate() : Math.min(day, last.getUTCDate()));
  return last.getTime() / DAY;
}

function semimonthlyFit(days: readonly number[], today: number) {
  if (days.length < 4) return;
  const first = new Date(days[0] * DAY);
  const month = first.getUTCFullYear() * 12 + first.getUTCMonth();
  let best: { paydayDays: readonly [Payday, Payday]; next: number; error: number } | undefined;
  for (let early = 1; early <= 21; early += 1) {
    // Try month end first so a tie keeps the calendar convention.
    const later: Payday[] = ["last", ...Array.from({ length: Math.max(0, 21 - early) }, (_, index) => early + 10 + index)];
    for (const late of later) {
      const minLate = late === "last" ? 28 : Math.min(28, late);
      const shortestGap = Math.min(minLate - early, 28 - minLate + early);
      if (shortestGap < 10) continue;
      const paydayDays = [early, late] as const;
      for (let start = -2; start <= 3; start += 1) {
        const scheduled = (index: number) => {
          const slot = start + index;
          return payday(month + Math.floor(slot / 2), paydayDays[Math.abs(slot % 2)]);
        };
        let error = 0;
        for (const [index, posted] of days.entries()) {
          const offset = posted - scheduled(index);
          if (offset < -3 || offset > 1) {
            error = Infinity;
            break;
          }
          error += Math.abs(offset);
        }
        const next = scheduled(days.length);
        if (next >= today - 1 && error < (best?.error ?? Infinity)) {
          best = { paydayDays, next: next < today ? scheduled(days.length + 1) : next, error };
        }
      }
    }
  }
  return best;
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
  const candidate = {
    key: createHash("sha256").update(identity).digest("hex"),
    name: last.name, kind, amountCents, occurrences: observations.length,
    ...(familySupport ? { familySupport: true } as const : {}),
  };
  const dates = observations.map(({ day }) => day);
  const semi = kind === "income" ? semimonthlyFit(dates, today) : undefined;
  for (const { cadence, days, tolerance } of PATTERNS) {
    const expected = (index: number) => days === null ? plusMonths(first, index) : first + index * days;
    if (!dates.every((day, index) => Math.abs(day - expected(index)) <= tolerance)) continue;
    const next = expected(dates.length);
    if (next < today - tolerance) continue;
    const error = dates.reduce((sum, day, index) => sum + Math.abs(day - expected(index)), 0);
    if (cadence === "biweekly" && semi && semi.error < error) break;
    return { ...candidate, cadence, nextDate: iso(next) };
  }
  if (semi) {
    return { ...candidate, cadence: "semimonthly", paydayDays: semi.paydayDays, nextDate: iso(semi.next) };
  }
}
