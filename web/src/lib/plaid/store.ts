import "server-only";

import type { Student } from "@/lib/api/auth";
import {
  BANK_BALANCE_FIELDS,
  BANK_LINK_FIELDS,
  BILL_COVERAGE_FIELDS,
  safeToSpendFromRows,
  type BankBalanceRow,
  type BankLinkRow,
  type BillCoverageRow,
  type SafeToSpend,
} from "@/lib/api/safe-to-spend";
import type { BalanceRow } from "@/lib/safe-to-spend/compute";

import type { PlaidConfig } from "./config";
import { openToken, sealToken } from "./token-box";

// Every read and write of a student's bank link, always with their own
// session (row level security, and functions that act on auth.uid() only;
// supabase/migrations/20261025210000_bank_link_safe_to_spend.sql).

type DatabaseError = { code?: string; message: string };
export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: DatabaseError };

// The student's link with its balances and answers, or null when no bank is linked.
export async function loadSafeToSpend(student: Student): Promise<StoreResult<SafeToSpend | null>> {
  const { supabase, studentId } = student;
  const [link, balances, coverage] = await Promise.all([
    supabase.from("bank_links").select(BANK_LINK_FIELDS).eq("student_id", studentId).maybeSingle(),
    supabase.from("bank_balances").select(BANK_BALANCE_FIELDS).eq("student_id", studentId).order("position"),
    supabase.from("bill_coverage").select(BILL_COVERAGE_FIELDS).eq("student_id", studentId),
  ]);
  const error = link.error ?? balances.error ?? coverage.error;
  if (error) return { ok: false, error };
  if (!link.data) return { ok: true, value: null };
  return {
    ok: true,
    value: safeToSpendFromRows(link.data as BankLinkRow, (balances.data ?? []) as BankBalanceRow[], (coverage.data ?? []) as BillCoverageRow[]),
  };
}

// Whether the student has a linked bank, and its status.
export async function linkStatus(student: Student): Promise<StoreResult<string | null>> {
  const { data, error } = await student.supabase.from("bank_links").select("status").eq("student_id", student.studentId).maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, value: data ? (data as { status: string }).status : null };
}

export type StoredItem =
  // The ciphertext does not open: the key changed, the row was not written by
  // the app, or there is no key to open it with.
  | { kind: "unreadable"; itemId: string }
  | { kind: "token"; itemId: string; accessToken: string };

export type StoredToken = { kind: "none" } | StoredItem;

// Every Item the student has linked (one today), with its access token
// decrypted here and never returned to the browser. With no config there is
// no key, so each comes back unreadable.
export async function readAccessTokens(student: Student, config: PlaidConfig | null): Promise<StoreResult<StoredItem[]>> {
  const { data, error } = await student.supabase.rpc("bank_link_secret");
  if (error) return { ok: false, error };
  const rows = (data as { item_id: string; token_ciphertext: string }[] | null) ?? [];
  return {
    ok: true,
    value: rows.map((row): StoredItem => {
      const accessToken = config
        ? openToken(row.token_ciphertext, config.tokenKey, { studentId: student.studentId, itemId: row.item_id })
        : null;
      if (accessToken === null) {
        if (config) console.error(JSON.stringify({ event: "plaid_token_unreadable" }));
        return { kind: "unreadable", itemId: row.item_id };
      }
      return { kind: "token", itemId: row.item_id, accessToken };
    }),
  };
}

// The student's one linked Item, or none.
export async function readAccessToken(student: Student, config: PlaidConfig): Promise<StoreResult<StoredToken>> {
  const items = await readAccessTokens(student, config);
  if (!items.ok) return items;
  return { ok: true, value: items.value[0] ?? { kind: "none" } };
}

// Saves a new link with the token sealed. "conflict" when the student already
// has a bank (unique_violation).
export async function saveBankLink(
  student: Student,
  config: PlaidConfig,
  link: { itemId: string; accessToken: string; institutionName: string },
): Promise<StoreResult<"saved" | "conflict">> {
  const tokenCiphertext = sealToken(link.accessToken, config.tokenKey, { studentId: student.studentId, itemId: link.itemId });
  const { error } = await student.supabase.rpc("save_bank_link", {
    p_item_id: link.itemId,
    p_token_ciphertext: tokenCiphertext,
    p_institution_name: link.institutionName,
  });
  if (error?.code === "23505") return { ok: true, value: "conflict" };
  if (error) return { ok: false, error };
  return { ok: true, value: "saved" };
}

// Replaces the balances and marks the link active. False when the bank was
// disconnected in the meantime.
export async function saveBalances(student: Student, rows: BalanceRow[]): Promise<StoreResult<boolean>> {
  const { data, error } = await student.supabase.rpc("save_bank_balances", {
    p_accounts: rows.map((row, position) => ({
      position,
      name: row.name,
      mask: row.mask,
      kind: row.kind,
      balance_cents: row.balanceCents,
    })),
  });
  if (error) return { ok: false, error };
  return { ok: true, value: data === true };
}

// The bank needs the student to sign in again (reconnect_needed), or the
// Item is gone and only a new link helps (relink_needed).
export async function markLinkStatus(student: Student, status: "reconnect_needed" | "relink_needed"): Promise<StoreResult<null>> {
  const { error } = await student.supabase.rpc("mark_bank_link_status", { p_status: status });
  return error ? { ok: false, error } : { ok: true, value: null };
}

// Deletes the token, the link, its balances and the answers. False when there
// was nothing to delete.
export async function deleteBankLink(student: Student): Promise<StoreResult<boolean>> {
  const { data, error } = await student.supabase.rpc("delete_bank_link");
  if (error) return { ok: false, error };
  return { ok: true, value: data === true };
}

export async function saveAnswers(
  student: Student,
  answers: { bills: { bill: string; coveredBy: string; monthlyCents: number | null }[]; setAsideCents: number },
): Promise<StoreResult<boolean>> {
  const { data, error } = await student.supabase.rpc("save_safe_to_spend_answers", {
    p_bills: answers.bills.map((answer) => ({ bill: answer.bill, covered_by: answer.coveredBy, monthly_cents: answer.monthlyCents })),
    p_set_aside_cents: answers.setAsideCents,
  });
  if (error) return { ok: false, error };
  return { ok: true, value: data === true };
}
