import "server-only";

import type { Student } from "@/lib/api/auth";
import { findCard } from "@/lib/cards/catalog";

import { getLiabilities, type PlaidCreditLiability } from "./client";
import type { PlaidConfig } from "./config";

// Card dates from the bank (US-15): a linked credit card's statement closing
// day and payment due day, filled into the student's card so its reminders
// plan themselves (the database re-plans them when the days change).
//
// The simple first version, only when it is clearly the same card: the
// student has exactly one approved card in Cense with no days yet, the linked
// bank is that card's bank (its brand, or for a card added by name, the name),
// and the bank has exactly one credit card. Days a student already entered
// are never overwritten. Nothing from Liabilities is stored except the two
// days. Plaid is only asked once there is a card to fill.

export type DueDays = { statementClosingDay: number; paymentDueDay: number };

export type FillOutcome =
  | { kind: "filled"; applicationId: string }
  // Nothing to do, or not clearly the same card.
  | {
      kind: "skipped";
      reason: "not_one_card" | "already_set" | "different_bank" | "no_liabilities" | "not_one_bank_card" | "no_dates";
    }
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

// The days of the one credit card, "not_one" when there is not exactly one,
// or null when it lacks either date.
export function dueDaysFrom(credit: PlaidCreditLiability[] | null | undefined): DueDays | null | "not_one" {
  if (!credit || credit.length !== 1) return "not_one";
  const statementClosingDay = dayOf(credit[0].last_statement_issue_date);
  const paymentDueDay = dayOf(credit[0].next_payment_due_date);
  if (statementClosingDay === null || paymentDueDay === null) return null;
  return { statementClosingDay, paymentDueDay };
}

const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

// Words in bank names that say nothing about which bank it is.
const GENERIC = new Set(["bank", "banking", "card", "cards", "credit", "online", "financial", "na", "the", "of", "usa"]);

// Whether the linked bank is this card's bank: the bank's name contains the
// catalog card's brand ("Citibank Online" and Citi, "U.S. Bank" and U.S.
// Bank), or, for a card added by name, the name contains the bank's own words
// ("First Platypus Bank" and "First Platypus Visa").
export function sameBank(institutionName: string, card: { card_id: string | null; card_name: string | null }): boolean {
  const bank = letters(institutionName);
  if (bank === "") return false;
  const brand = card.card_id ? findCard(card.card_id)?.brand : undefined;
  if (brand) return bank.includes(letters(brand));
  if (!card.card_name) return false;
  const core = letters(
    institutionName
      .split(/\s+/)
      .filter((word) => !GENERIC.has(letters(word)))
      .join(""),
  );
  return core.length >= 3 && letters(card.card_name).includes(core);
}

type CardRow = {
  id: string;
  card_id: string | null;
  card_name: string | null;
  statement_closing_day: number | null;
  payment_due_day: number | null;
};

export async function fillCardDueDays(
  student: Student,
  config: PlaidConfig,
  item: { accessToken: string; institutionName: string | null },
): Promise<FillOutcome> {
  const cards = await student.supabase
    .from("card_applications")
    .select("id, card_id, card_name, statement_closing_day, payment_due_day")
    .eq("student_id", student.studentId)
    .eq("status", "approved");
  if (cards.error) return { kind: "database", code: cards.error.code ?? null };
  const rows = (cards.data ?? []) as CardRow[];
  if (rows.length !== 1) return { kind: "skipped", reason: "not_one_card" };
  const card = rows[0];
  if (card.statement_closing_day !== null || card.payment_due_day !== null) return { kind: "skipped", reason: "already_set" };
  if (!item.institutionName || !sameBank(item.institutionName, card)) return { kind: "skipped", reason: "different_bank" };

  const read = await getLiabilities(config, item.accessToken);
  if (!read.ok) {
    if (read.kind === "plaid" && NO_LIABILITIES.includes(read.code)) return { kind: "skipped", reason: "no_liabilities" };
    return { kind: "plaid", code: read.kind === "plaid" ? read.code : null };
  }
  const days = dueDaysFrom(read.data.liabilities.credit);
  if (days === "not_one") return { kind: "skipped", reason: "not_one_bank_card" };
  if (days === null) return { kind: "skipped", reason: "no_dates" };

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
