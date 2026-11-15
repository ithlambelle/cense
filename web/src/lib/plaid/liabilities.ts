import "server-only";

import type { Student } from "@/lib/api/auth";

import { getLiabilities, type PlaidCreditLiability } from "./client";
import type { PlaidConfig } from "./config";

// Card dates from the bank (US-15): a linked credit card's statement closing
// day and payment due day, filled into the student's card so its reminders
// plan themselves (the database re-plans them when the days change).
//
// The simple first version: only when the bank has exactly one credit card
// and the student has exactly one approved card in Cense, since bank account
// names do not reliably match our catalog. Days a student already entered are
// never overwritten. Nothing from Liabilities is stored except the two days.

export type DueDays = { statementClosingDay: number; paymentDueDay: number };

export type FillOutcome =
  | { kind: "filled"; applicationId: string }
  // Nothing to do: no single card on either side, days already set, or the
  // bank has no Liabilities for this Item.
  | { kind: "skipped"; reason: "no_liabilities" | "not_one_bank_card" | "no_dates" | "not_one_card" | "already_set" }
  | { kind: "plaid"; code: string | null }
  | { kind: "database"; code: string | null };

// Plaid's codes for an Item with no Liabilities to read.
const NO_LIABILITIES = ["PRODUCTS_NOT_SUPPORTED", "NO_LIABILITY_ACCOUNTS", "PRODUCT_NOT_READY", "ADDITIONAL_CONSENT_REQUIRED"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayOf(date: string | null | undefined): number | null {
  if (!date || !DATE.test(date)) return null;
  const day = Number(date.slice(8, 10));
  return day >= 1 && day <= 31 ? day : null;
}

// The days of the one credit card, or null when there is not exactly one or
// it lacks either date.
export function dueDaysFrom(credit: PlaidCreditLiability[] | null | undefined): DueDays | null | "not_one" {
  if (!credit || credit.length !== 1) return "not_one";
  const statementClosingDay = dayOf(credit[0].last_statement_issue_date);
  const paymentDueDay = dayOf(credit[0].next_payment_due_date);
  if (statementClosingDay === null || paymentDueDay === null) return null;
  return { statementClosingDay, paymentDueDay };
}

type CardRow = { id: string; statement_closing_day: number | null; payment_due_day: number | null };

export async function fillCardDueDays(student: Student, config: PlaidConfig, accessToken: string): Promise<FillOutcome> {
  const read = await getLiabilities(config, accessToken);
  if (!read.ok) {
    if (read.kind === "plaid" && NO_LIABILITIES.includes(read.code)) return { kind: "skipped", reason: "no_liabilities" };
    return { kind: "plaid", code: read.kind === "plaid" ? read.code : null };
  }
  const days = dueDaysFrom(read.data.liabilities.credit);
  if (days === "not_one") return { kind: "skipped", reason: "not_one_bank_card" };
  if (days === null) return { kind: "skipped", reason: "no_dates" };

  const cards = await student.supabase
    .from("card_applications")
    .select("id, statement_closing_day, payment_due_day")
    .eq("student_id", student.studentId)
    .eq("status", "approved");
  if (cards.error) return { kind: "database", code: cards.error.code ?? null };
  const rows = (cards.data ?? []) as CardRow[];
  if (rows.length !== 1) return { kind: "skipped", reason: "not_one_card" };
  const card = rows[0];
  if (card.statement_closing_day !== null || card.payment_due_day !== null) return { kind: "skipped", reason: "already_set" };

  // Still empty at write time, so a day the student typed meanwhile wins.
  const saved = await student.supabase
    .from("card_applications")
    .update({ statement_closing_day: days.statementClosingDay, payment_due_day: days.paymentDueDay })
    .eq("id", card.id)
    .eq("student_id", student.studentId)
    .is("statement_closing_day", null)
    .is("payment_due_day", null)
    .select("id");
  if (saved.error) return { kind: "database", code: saved.error.code ?? null };
  if (!saved.data || saved.data.length === 0) return { kind: "skipped", reason: "already_set" };
  return { kind: "filled", applicationId: card.id };
}
