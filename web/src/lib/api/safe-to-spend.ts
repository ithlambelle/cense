import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
  BILLS,
  computeSafeToSpend,
  COVERED_BY,
  MAX_MONTHLY_CENTS,
  SEMESTER_BILL,
  SPREAD_DAYS,
  type AccountKind,
  type Bill,
  type CoveredBy,
} from "@/lib/safe-to-spend/compute";

extendZodWithOpenApi(z);

// Safe to spend on a Plaid sandbox bank (US-12). The bank is linked and read
// on the server; the browser never receives the access token or any Plaid
// response, only these shapes.

export const billSchema = z.enum(BILLS);
export const coveredBySchema = z.enum(COVERED_BY);
const monthlyCentsSchema = z.int().min(0).max(MAX_MONTHLY_CENTS);

export const billAnswerSchema = z
  .strictObject({
    bill: billSchema,
    coveredBy: coveredBySchema,
    // The student's own monthly amount: the bill for "me", their share for
    // "split", null for "family" and "none". Tuition is asked per semester
    // and sent as its monthly figure.
    monthlyCents: monthlyCentsSchema.nullable(),
    // The day of the month it is due (1 to 31), for a bill the student pays;
    // null for tuition and for bills they do not pay.
    dueDay: z.int().min(1).max(31).nullable(),
  })
  .refine((answer) => (answer.coveredBy === "me" || answer.coveredBy === "split") === (answer.monthlyCents !== null), {
    message: "An amount is needed for me and split, and only for those.",
    path: ["monthlyCents"],
  })
  .refine(
    (answer) =>
      ((answer.coveredBy === "me" || answer.coveredBy === "split") && answer.bill !== SEMESTER_BILL) === (answer.dueDay !== null),
    { message: "A due day is needed for a monthly bill the student pays, and only for those.", path: ["dueDay"] },
  );

export const saveSafeToSpendAnswersSchema = z
  .strictObject({
    // One answer for each of the five bills.
    bills: z.array(billAnswerSchema).length(BILLS.length),
    setAsideCents: monthlyCentsSchema,
  })
  .refine((body) => new Set(body.bills.map((answer) => answer.bill)).size === BILLS.length, {
    message: "Answer each bill once.",
    path: ["bills"],
  });

export const createBankLinkSchema = z.strictObject({
  // The one-time token Plaid Link hands the browser; exchanged on the server.
  publicToken: z.string().min(1).max(300),
});

export const linkTokenSchema = z
  .strictObject({
    linkToken: z.string(),
    expiration: z.iso.datetime({ offset: true }),
    // create: a new bank. update: the same bank, signing in again.
    mode: z.enum(["create", "update"]),
  })
  .openapi("LinkToken");

// reconnect_needed: sign in to the bank again (Link update mode).
// relink_needed: the Item is gone at Plaid; disconnect and link again.
export const bankLinkStatusSchema = z.enum(["active", "reconnect_needed", "relink_needed"]);

export const bankAccountSchema = z
  .strictObject({
    name: z.string(),
    mask: z.string().nullable(),
    // cash: counted. card: its balance owed is subtracted. other: savings and similar, not counted.
    kind: z.enum(["cash", "card", "other"]),
    balanceCents: z.int(),
  })
  .openapi("BankAccount");

export const safeToSpendSchema = z
  .strictObject({
    institutionName: z.string(),
    status: bankLinkStatusSchema,
    linkedAt: z.iso.datetime({ offset: true }),
    // When balances were last read from Plaid.
    refreshedAt: z.iso.datetime({ offset: true }).nullable(),
    // False until the student has said who covers their bills.
    answered: z.boolean(),
    accounts: z.array(bankAccountSchema),
    bills: z.array(billAnswerSchema),
    setAsideCents: z.int(),
    cashCents: z.int(),
    cardCents: z.int(),
    billsCents: z.int(),
    leftCents: z.int(),
    days: z.literal(SPREAD_DAYS),
    dailyCents: z.int(),
  })
  .openapi("SafeToSpend");

export type SafeToSpend = z.infer<typeof safeToSpendSchema>;
export type BillAnswerBody = z.infer<typeof billAnswerSchema>;

export const BANK_LINK_FIELDS = "institution_name, status, linked_at, refreshed_at, set_aside_cents, answered_at";
export const BANK_BALANCE_FIELDS = "position, name, mask, kind, balance_cents";
export const BILL_COVERAGE_FIELDS = "bill, covered_by, monthly_cents, due_day";

export type BankLinkRow = {
  institution_name: string;
  status: string;
  linked_at: string;
  refreshed_at: string | null;
  set_aside_cents: number | string;
  answered_at: string | null;
};
export type BankBalanceRow = { position: number; name: string; mask: string | null; kind: string; balance_cents: number | string };
export type BillCoverageRow = { bill: string; covered_by: string; monthly_cents: number | string | null; due_day: number | null };

const iso = (value: string) => new Date(value).toISOString();

// Today's day of the month on the app's calendar (Eastern, the reminder
// job's default; per-student time zones are SCOPE-20).
export function todayDay(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(now));
}

// Rows to the API shape, with the sum worked out. bigint columns may arrive
// as strings, so every amount goes through Number().
export function safeToSpendFromRows(
  link: BankLinkRow,
  balances: BankBalanceRow[],
  coverage: BillCoverageRow[],
  today: number = todayDay(),
): SafeToSpend {
  const accounts = [...balances]
    .sort((a, b) => a.position - b.position)
    .map((row) => ({ name: row.name, mask: row.mask, kind: row.kind as AccountKind, balanceCents: Number(row.balance_cents) }));
  const bills = BILLS.flatMap((bill) => {
    const row = coverage.find((answer) => answer.bill === bill);
    return row
      ? [{ bill: bill as Bill, coveredBy: row.covered_by as CoveredBy, monthlyCents: row.monthly_cents === null ? null : Number(row.monthly_cents), dueDay: row.due_day }]
      : [];
  });
  const setAsideCents = Number(link.set_aside_cents);
  return {
    institutionName: link.institution_name,
    status: bankLinkStatusSchema.parse(link.status),
    linkedAt: iso(link.linked_at),
    refreshedAt: link.refreshed_at ? iso(link.refreshed_at) : null,
    answered: link.answered_at !== null,
    accounts,
    bills,
    ...computeSafeToSpend({ accounts, bills, setAsideCents, today }),
  };
}
